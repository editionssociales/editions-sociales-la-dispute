import type { Metadata } from "next";
import Link from "next/link";
import type { Book } from "@/lib/types";
import { Container } from "@/components/container";
import { BookGrid } from "@/components/book-grid";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { ShelfCover } from "@/components/shelf-cover";
import { ShelfLock } from "@/components/shelf-lock";
import { CountUp } from "@/components/count-up";
import { Gauge } from "@/components/gauge";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { getNewReleases, countBooks } from "@/lib/catalogue";
import { CAMPAIGN_2024 } from "@/lib/campaign";
import { coverAspectRatio } from "@/lib/cover";
import type { Accent } from "@/lib/format";
import { ACCENTS, ACCENT_BG as BG, ACCENT_TEXT as TEXT } from "@/lib/accents";
import { FOCUS_RING } from "@/lib/ui";
import { donationsEnabled } from "@/lib/stripe";
import { FREE_AMOUNT } from "@/lib/donation-tiers";
import { getCampaign2026 } from "@/lib/donations";
import { getPageSouscription } from "@/lib/site-content";
import { createDonationCheckout } from "./actions";

/**
 * Grammaire brutaliste (voir AGENTS.md) : quadrillage noir 2px
 * (`grid gap-[2px] bg-black p-[2px]`, cellules `bg-white`), Effra en
 * italique gras pour les titres, libellés en majuscules. Les quatre aplats
 * « pop » codent ici les paliers et étiquettes (pas les sections de nav).
 */
const POP_BG = ["bg-pop-pink", "bg-pop-teal", "bg-pop-orange", "bg-pop-yellow"];

export const metadata: Metadata = {
  title: "Souscription",
  description:
    "Face à la concentration capitaliste de l'édition, Les Éditions sociales et La Dispute tiennent deux catalogues marxistes et critiques — Marx et Engels, savoirs populaires, féminismes matérialistes —, sans mécène ni actionnaire. Une souscription pour continuer. Contreparties de 15 à 1 000 €.",
  alternates: { canonical: "/souscription" },
};

export const revalidate = 3600; // fenêtre ISR du catalogue (donnée Payload/Postgres)

/* ------------------------------------------------------------------ */
/* Contenu repris de la campagne Ulule 2024                            */
/* « Sauvez les Éditions sociales et La Dispute »                      */
/*                                                                     */
/* Faits + dérivations (collecte, paliers atteints, % de l'objectif,   */
/* plafond de jauge, tuiles de stats) : voir lib/campaign.             */
/*                                                                     */
/* Héros, chantiers, contreparties, mécènes et FAQ sont éditables dans */
/* /admin (global `page-souscription`, spec « éditeur de contenus ») : */
/* lus via `getPageSouscription` — bloc vide = contenu par défaut de   */
/* `lib/site-content-core.ts` (l'ex-contenu en dur de cette page,      */
/* extrait verbatim, iso-rendu). Montant et intitulé des paliers       */
/* restent dérivés de DONATION_TIERS (la table qui pilote Stripe) : la */
/* présentation est éditable, jamais le paiement.                      */
/* ------------------------------------------------------------------ */

// Perspectives éditoriales des deux maisons (reprises de la campagne).
const MAISONS: {
  nom: string;
  accent: Accent;
  desc: string;
  chips: string[];
}[] = [
  {
    nom: "La Dispute",
    accent: "brick",
    desc: "S'acharner à publier des livres exigeants sur le travail et les formes d'exploitation, le genre et les féminismes matérialistes, l'éducation et la pédagogie démocratique. Intervenir dans les débats contemporains avec des petits livres d'intervention, et inventer de nouvelles formes éditoriales, comme Avoir 20 ans à Sainte-Soline.",
    chips: ["Travail et salariat", "Le genre du monde", "L'enjeu scolaire", "Entretiens"],
  },
  {
    nom: "Les Éditions sociales",
    accent: "navy",
    desc: "Poursuivre la GEME — ce projet formidable et un peu fou de rendre accessibles tous les textes de Marx et d'Engels dans des traductions nouvelles. Constituer le plus grand fonds de livres marxistes en français, faire découvrir une nouvelle génération d'auteur·ices et installer la collection de pédagogie « Découvrir ».",
    chips: ["GEME", "Les éclairées", "Découvrir", "Fonds marxiste"],
  },
];

// Étagère du héro : dimensions en pixels des dos de livres dessinés.
const SPINES: { h: number; w: number }[] = [
  { h: 88, w: 24 },
  { h: 120, w: 32 },
  { h: 72, w: 20 },
  { h: 132, w: 28 },
  { h: 96, w: 36 },
  { h: 148, w: 24 },
  { h: 108, w: 28 },
  { h: 84, w: 20 },
  { h: 136, w: 32 },
  { h: 100, w: 24 },
  { h: 116, w: 28 },
];
const SHELF_GAP = 6; // = gap-1.5 entre les dos
/**
 * Hauteur uniforme (px) du livre déplié au survol. Les dos gardent leur
 * hauteur variée au repos (l'étagère), mais tous les livres atteignent cette
 * hauteur une fois sortis — grand format, pour bien présenter la couverture.
 * Voir --bh dans .book3d-inner (globals.css).
 */
const BOOK_HOVER_H = 320;

/**
 * Étagère du héro : chaque dos dessiné porte une parution récente réelle. Au
 * survol ou au focus clavier, le livre sort du rayon en 3D : il pivote sur
 * l'arête de sa reliure (bord droit du dos) pour présenter sa couverture,
 * qui glisse vers le haut-gauche hors de l'étagère (translateX/Y/Z + rotateY
 * -78deg, cf. .book3d* dans globals.css). Titre, auteur et collection
 * apparaissent en typo nue sous la barre de l'étagère. CSS pur, aucun JS client.
 */
function HeroShelf({ books }: { books: Book[] }) {
  // Décalage de chaque dos par rapport au bord gauche de l'étagère, pour
  // ancrer le bloc de texte au même endroit quel que soit le dos survolé.
  const leftOffsets = SPINES.map((_, i) =>
    SPINES.slice(0, i).reduce((acc, s) => acc + s.w + SHELF_GAP, 0),
  );
  return (
    <ShelfLock className="hidden lg:block">
      <div className="flex items-end gap-1.5">
        {SPINES.map((s, i) => {
          const book = books[i];
          if (!book?.cover) {
            return (
              <div
                key={i}
                aria-hidden="true"
                className={`shrink-0 rounded-t-sm ${BG[ACCENTS[i % 4]]} animate-[spine-rise_0.7s_ease-out_both]`}
                style={{ width: s.w, height: s.h, animationDelay: `${i * 70}ms` }}
              />
            );
          }
          return (
            <Link
              key={i}
              href={`/catalogue/${book.edition}/${book.slug}`}
              className={`book3d${i < 2 ? " book3d--edge" : ""} relative block shrink-0 animate-[spine-rise_0.7s_ease-out_both] focus-visible:z-30 focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-[-3px]`}
              style={{ width: s.w, height: s.h, animationDelay: `${i * 70}ms` }}
            >
              <span className="sr-only">
                {book.title}
                {book.authors[0] ? `, ${book.authors[0].name}` : ""}
              </span>
              {/* Titre, auteur, collection — fondu sous la barre de l'étagère.
                  Affiché quand le dos est ouvert (classe is-open pilotée par
                  ShelfLock) ou au focus clavier ; cf. .book3d-cap (globals.css). */}
              <span
                className="book3d-cap pointer-events-none absolute z-10 block w-[340px] opacity-0 transition-opacity duration-300 motion-reduce:transition-none"
                style={{ left: -leftOffsets[i], top: "calc(100% + 16px)" }}
                aria-hidden="true"
              >
                <span className="block font-serif text-sm font-semibold text-paper">
                  {book.title}
                </span>
                {book.authors.length > 0 && (
                  <span className="block text-sm text-paper/72">
                    {book.authors.map((a) => a.name).join(", ")}
                  </span>
                )}
                {book.collection && (
                  <span className="mt-0.5 block text-xs tracking-wide text-paper/50">
                    {book.collection.name}
                  </span>
                )}
              </span>
              {/* Sortie 3D : le dos pivote sur son arête de reliure pour présenter sa couverture */}
              <div
                className="book3d-inner"
                style={
                  {
                    "--w": `${s.w}px`,
                    "--h": `${s.h}px`,
                    "--bh": `${BOOK_HOVER_H}px`,
                  } as React.CSSProperties
                }
              >
                <div className={`book3d-spine ${BG[ACCENTS[i % 4]]}`} />
                {/* La face couverture adopte le format exact de l'image : ratio
                    DB au rendu serveur, ratio réel dès le chargement. */}
                <ShelfCover
                  url={book.cover.url}
                  ratio={coverAspectRatio(book.cover)}
                />
              </div>
            </Link>
          );
        })}
      </div>
      <div className="h-1.5 rounded bg-paper/25" />
      {/* Zone réservée sous la barre : l'encart titre/auteur/collection du dos
          ouvert s'y affiche (positionné en absolu depuis chaque lien). */}
      <div aria-hidden="true" className="h-20" />
    </ShelfLock>
  );
}

export default async function SouscriptionPage() {
  // Interrupteur de la phase dons (E1) : tant que `STRIPE_SECRET_KEY` est
  // absente, la page reste en iso-rendu (boutons inertes, comme aujourd'hui).
  const enabled = donationsEnabled();
  // `getCampaign2026()` ne fait aucun appel réseau tant que `donationsEnabled()`
  // est faux (elle jette avant tout fetch, absorbée en `null` — `lib/donations.ts`) :
  // gratuit à appeler inconditionnellement.
  const [releases, totalBooks, campaign2026, content] = await Promise.all([
    getNewReleases(18),
    countBooks(),
    getCampaign2026(),
    getPageSouscription(),
  ]);
  const newReleases = releases.slice(0, 4);
  // L'étagère du héro porte de vraies parutions : couverture + fiche interne requises.
  const shelfBooks = releases
    .filter((b) => b.cover && b.edition)
    .slice(0, SPINES.length);

  return (
    <>
      {/* Ouverture (fond clair) : ce que la souscription de 2024 a déjà
          permis — stats + jauge. Fond clair pour préserver l'alternance de
          couleurs des sections suivantes. */}
      <section className="border-b-2 border-black bg-white">
        <Container className="py-16 sm:py-24">
          <Reveal>
            <Eyebrow dot="bg-pop-teal">Nous soutenir</Eyebrow>
            <h1 className="mt-3 max-w-3xl font-sans text-3xl font-black italic leading-[0.98] text-black sm:text-4xl">
              {content.herosTitre}
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-black/70">
              {content.herosIntro}
            </p>
          </Reveal>
          <FramedGrid className="mt-10 sm:grid-cols-2 lg:grid-cols-4">
            {CAMPAIGN_2024.stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 120} className="h-full">
                <div className={`flex h-full flex-col justify-center p-6 ${POP_BG[i % 4]}`}>
                  <CountUp
                    value={s.value}
                    suffix={s.suffix}
                    className="font-sans text-4xl font-black italic text-black sm:text-5xl"
                  />
                  <p className="mt-1 text-sm font-semibold text-black">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </FramedGrid>
          <Reveal delay={200} className="mt-12">
            <div className="border-2 border-black bg-white p-6">
              <Gauge
                value={CAMPAIGN_2024.gauge.value}
                max={CAMPAIGN_2024.gauge.max}
                markers={CAMPAIGN_2024.gauge.markers}
              />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Souscription de lancement — le projet en bref (fusion « qui nous
          sommes ») et l'étagère de nos parutions. Fond sombre : l'étagère 3D
          et sa typo claire y sont pensées. */}
      <section className="bg-ink text-paper">
        <Container className="py-16 sm:py-24">
          <div className="grid items-end gap-12 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-paper/70">
                Souscription de lancement
              </p>
              <h2 className="mt-4 max-w-3xl font-sans text-3xl font-black italic leading-[1.02] sm:text-5xl">
                Tenir une édition marxiste{" "}
                <span className="text-pop-yellow">et indépendante</span>
              </h2>
              <p className="mt-6 max-w-2xl text-paper/85">
                Deux catalogues marxistes et critiques, une seule petite équipe
                d&apos;éditrices, et un principe : rester indépendants face à la
                poignée de groupes capitalistes qui accaparent l&apos;édition, la
                diffusion et les médias. Sans mécène ni actionnaire, nous vivons
                de la vente de nos livres — et, pour tenir, de cette souscription.
              </p>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-paper/80">
                {[
                  `${totalBooks} titres au catalogue`,
                  "Le plus grand fonds marxiste en français",
                  "Sans mécène ni actionnaire",
                ].map((label, i) => (
                  <span key={label} className="flex items-center gap-2">
                    <span className={`h-2 w-2 ${POP_BG[i % 4]}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <HeroShelf books={shelfBooks} />
          </div>
        </Container>
      </section>

      {/* Jauge 2026 vivante — n'affiche que ce qu'une campagne en cours peut
          honnêtement montrer (collecté net + contributeurs), jamais les 4
          tuiles `stats` du gabarit 2024 rétrospectif ci-dessus (piège documenté
          dans `lib/donation-tiers.ts`/`lib/donations.ts`). Fenêtre de
          fraîcheur ~1–3 min, voir `src/app/CLAUDE.md`. */}
      {campaign2026 && campaign2026.collected > 0 && (
        <section className="border-b-2 border-black bg-white">
          <Container className="py-16 sm:py-20">
            <Reveal>
              <Eyebrow dot="bg-pop-orange">Souscription 2026</Eyebrow>
              <h2 className="mt-3 font-sans text-3xl font-black italic text-black sm:text-4xl">
                La collecte en direct
              </h2>
              <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-[15px] leading-relaxed text-black/70">
                Déjà
                <CountUp
                  value={campaign2026.collected}
                  suffix=" €"
                  className="font-sans text-lg font-black italic text-black"
                />
                réunis auprès de
                <CountUp
                  value={campaign2026.contributors}
                  className="font-sans text-lg font-black italic text-black"
                />
                contributeur·rices. La jauge se met à jour en quelques minutes après un don.
              </p>
            </Reveal>
            <Reveal delay={120} className="mt-10">
              <div className="border-2 border-black bg-white p-6">
                <Gauge
                  value={campaign2026.gauge.value}
                  max={campaign2026.gauge.max}
                  markers={campaign2026.gauge.markers}
                />
              </div>
            </Reveal>
          </Container>
        </section>
      )}

      {/* Contreparties */}
      <section id="paliers" className="border-b-2 border-black bg-white">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <Eyebrow dot="bg-pop-pink">Les paliers</Eyebrow>
            <h2 className="mt-3 font-sans text-3xl font-black italic text-black sm:text-4xl">
              Choisissez votre contrepartie
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-black/70">
              Les contreparties de notre campagne 2024, de retour pour la
              souscription de lancement. Contributions directes, sans
              intermédiaire — 100&nbsp;% pour la maison. Et bien sûr, notre
              reconnaissance éternelle est comprise dans tous les paliers.
            </p>
          </Reveal>
          <FramedGrid className="mt-10 sm:grid-cols-2 lg:grid-cols-4">
            {content.contreparties.map((p, i) => {
              const pop = POP_BG[i % 4];
              return (
                <Reveal key={p.tier.id} delay={(i % 4) * 90} className="h-full">
                  <div className="relative flex h-full flex-col bg-white">
                    <div aria-hidden="true" className={`h-2 ${pop}`} />
                    {p.populaire && (
                      <span className="bg-black px-3 py-1.5 text-center font-sans text-[10px] font-extrabold uppercase tracking-[.08em] text-pop-yellow">
                        Le plus choisi en 2024
                      </span>
                    )}
                    <div className="flex flex-1 flex-col p-6">
                      <span className="font-sans text-4xl font-black italic text-black">
                        {p.tier.amount}&nbsp;€
                      </span>
                      <span className="mt-1 font-sans text-sm font-extrabold uppercase tracking-[.02em] text-black">
                        {p.tier.title}
                      </span>
                      <ul className="mt-4 flex-1 space-y-2 text-sm text-black/70">
                        {p.items.map((item) => (
                          <li key={item} className="flex gap-2.5">
                            <span
                              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 ${pop}`}
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-4 font-sans text-xs font-bold uppercase tracking-[.04em] text-black/50">
                        {p.soutiens2024} soutiens en 2024
                      </p>
                      {enabled ? (
                        <form
                          action={createDonationCheckout}
                          className="contents"
                        >
                          <input type="hidden" name="tierId" value={p.tier.id} />
                          <Button
                            type="submit"
                            variant="solid"
                            className="mt-3 px-4 py-2.5 text-sm tracking-[.03em]"
                          >
                            Contribuer
                          </Button>
                        </form>
                      ) : (
                        <Button
                          variant="solid"
                          className="mt-3 px-4 py-2.5 text-sm tracking-[.03em]"
                        >
                          Contribuer
                        </Button>
                      )}
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </FramedGrid>
          {/* Grands paliers : cartes inversées */}
          <FramedGrid className="mt-[2px] md:grid-cols-2">
            {content.mecenes.map((p, i) => (
              <Reveal key={p.tier.id} delay={i * 120} className="h-full">
                <div className="relative flex h-full flex-col overflow-hidden bg-black p-8 text-white">
                  <div className="absolute inset-x-0 top-0 grid h-1.5 grid-cols-4" aria-hidden="true">
                    {POP_BG.map((c) => (
                      <div key={c} className={c} />
                    ))}
                  </div>
                  <span className="font-sans text-5xl font-black italic text-white">
                    {p.tier.amount.toLocaleString("fr-FR")}&nbsp;€
                  </span>
                  <span className="mt-1 font-sans text-lg font-extrabold uppercase tracking-[.02em] text-white/90">
                    {p.tier.title}
                  </span>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-white/80">{p.desc}</p>
                  <p className="mt-4 font-sans text-xs font-bold uppercase tracking-[.04em] text-white/60">
                    {p.soutiens2024} soutiens en 2024
                  </p>
                  {enabled ? (
                    <form action={createDonationCheckout}>
                      <input type="hidden" name="tierId" value={p.tier.id} />
                      {/* Piège R12 : ce bouton était un <button type="button"> nu — dans
                          un <form>, il ne soumettrait jamais sans ce passage en "submit". */}
                      <button
                        type="submit"
                        className="mt-3 self-start border-2 border-white bg-white px-6 py-2.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white"
                      >
                        Contribuer
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="mt-3 self-start border-2 border-white bg-white px-6 py-2.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white"
                    >
                      Contribuer
                    </button>
                  )}
                </div>
              </Reveal>
            ))}
          </FramedGrid>
        </Container>
      </section>

      {/* Les chantiers : où va votre argent */}
      <section className="border-b-2 border-black bg-white">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <Eyebrow dot="bg-pop-orange">Où va votre argent</Eyebrow>
            <h2 className="mt-3 font-sans text-3xl font-black italic text-black sm:text-4xl">
              Cinq chantiers pour la suite
            </h2>
          </Reveal>
          <FramedGrid className="mt-10 md:grid-cols-2 lg:grid-cols-6">
            {content.chantiers.map((c, i) => (
              <Reveal
                key={c.titre}
                delay={i * 100}
                className={`h-full ${i < 3 ? "lg:col-span-2" : "lg:col-span-3"}`}
              >
                <div className="flex h-full flex-col bg-white p-6">
                  <span className={`font-sans text-3xl font-black italic ${TEXT[c.accent]}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 font-sans text-xl font-black italic text-black">{c.titre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-black/70">{c.desc}</p>
                </div>
              </Reveal>
            ))}
          </FramedGrid>
        </Container>
      </section>

      {/* Et après : les perspectives des deux maisons — la suite */}
      <section className="border-b-2 border-black bg-white">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <Eyebrow dot="bg-pop-teal">Et après</Eyebrow>
            <h2 className="mt-3 font-sans text-3xl font-black italic text-black sm:text-4xl">
              Des projets, on en a plein
            </h2>
          </Reveal>
          <FramedGrid className="mt-10 md:grid-cols-2">
            {MAISONS.map((m, i) => (
              <Reveal key={m.nom} delay={i * 120} className="h-full">
                <div className="flex h-full flex-col bg-white">
                  <div aria-hidden="true" className={`h-2 ${BG[m.accent]}`} />
                  <div className="flex flex-1 flex-col p-7">
                    <h3 className={`font-sans text-2xl font-black italic ${TEXT[m.accent]}`}>
                      {m.nom}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-black/70">{m.desc}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {m.chips.map((chip) => (
                        <span
                          key={chip}
                          className="border border-black px-3 py-1 font-sans text-xs font-bold uppercase tracking-[.03em] text-black"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </FramedGrid>
        </Container>
      </section>

      {/* Aperçu du catalogue */}
      {newReleases.length > 0 && (
        <section className="border-b-2 border-black bg-white">
          <Container className="py-16">
            <Reveal>
              <div className="mb-8 flex items-end justify-between">
                <div>
                  <h2 className="font-sans text-2xl font-black italic text-black">
                    En attendant, le catalogue vous attend
                  </h2>
                  <p className="mt-1 text-black/70">
                    Dernières parutions des deux fonds réunis.
                  </p>
                </div>
                <Link
                  href="/catalogue"
                  className="shrink-0 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-black hover:underline"
                >
                  Tout voir →
                </Link>
              </div>
            </Reveal>
            <BookGrid books={newReleases} />
          </Container>
        </section>
      )}

      {/* FAQ */}
      <section className="bg-white">
        <Container className="max-w-3xl py-16 sm:py-20">
          <Reveal>
            <Eyebrow dot="bg-pop-yellow">FAQ</Eyebrow>
            <h2 className="mt-3 font-sans text-3xl font-black italic text-black">
              Questions fréquentes
            </h2>
          </Reveal>
          <div className="mt-8 divide-y-2 divide-black border-2 border-black">
            {content.faq.map((item, i) => (
              <Reveal key={item.q} delay={i * 80}>
                <details className="group bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-sans font-bold text-black [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      className="shrink-0 font-sans text-xl leading-none text-pop-orange transition-transform group-open:rotate-45"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-black/70">{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA final */}
      <section className="bg-black text-white">
        <div className="grid grid-cols-4" aria-hidden="true">
          {POP_BG.map((c) => (
            <div key={c} className={`h-1.5 ${c}`} />
          ))}
        </div>
        <Container className="flex flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-sans text-2xl font-black italic sm:text-3xl">
              Prêt·e à écrire la suite avec nous&nbsp;?
            </h2>
            <p className="mt-2 text-white/75">
              En 2024, vous étiez 958. Cette fois, chaque contribution va
              intégralement à la maison.
            </p>
          </div>
          {enabled ? (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <form
                action={createDonationCheckout}
                className="flex items-center gap-3"
              >
                <label htmlFor="cta-amount" className="sr-only">
                  Montant libre, en euros
                </label>
                <input
                  id="cta-amount"
                  name="amount"
                  type="number"
                  min={FREE_AMOUNT.min}
                  max={FREE_AMOUNT.max}
                  step={1}
                  inputMode="numeric"
                  placeholder="Montant en €"
                  required
                  className={`w-36 border-2 border-white bg-black px-4 py-3.5 font-sans text-sm font-semibold text-white placeholder:text-white/50 ${FOCUS_RING}`}
                />
                <button
                  type="submit"
                  className="shrink-0 border-2 border-white bg-white px-7 py-3.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white"
                >
                  Contribuer
                </button>
              </form>
              <a
                href="#paliers"
                className="shrink-0 border-2 border-white bg-white px-7 py-3.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white"
              >
                Choisir un palier
              </a>
            </div>
          ) : (
            <a
              href="#paliers"
              className="shrink-0 border-2 border-white bg-white px-7 py-3.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white"
            >
              Choisir un palier
            </a>
          )}
        </Container>
      </section>
    </>
  );
}
