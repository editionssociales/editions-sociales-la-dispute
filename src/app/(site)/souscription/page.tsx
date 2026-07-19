import type { Metadata } from "next";
import Link from "next/link";
import type { Book } from "@/lib/types";
import { Container } from "@/components/container";
import { BookGrid } from "@/components/book-grid";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { SubmitButton } from "@/components/submit-button";
import { ShelfCover } from "@/components/shelf-cover";
import { ShelfLock } from "@/components/shelf-lock";
import { BookCover, coverAspectRatio } from "@/lib/cover";
import { CountUp } from "@/components/count-up";
import { Gauge } from "@/components/gauge";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { getNewReleases, countBooks } from "@/lib/catalogue";
import { CAMPAIGN_2024 } from "@/lib/campaign";
import { formatInt, type Accent } from "@/lib/format";
import { ACCENTS, ACCENT_BG as BG, ACCENT_TEXT as TEXT } from "@/lib/accents";
import { FOCUS_RING_DARK, FOCUS_RING_DARK_OUTER, FOCUS_RING_LIGHT } from "@/lib/ui";
import { donationsEnabled } from "@/lib/stripe";
import { FREE_AMOUNT, deriveCampaign2026 } from "@/lib/donation-tiers";
import { getCampaign2026 } from "@/lib/donations";
import { getPageSouscription } from "@/lib/site-content";
import { createDonationCheckout } from "./actions";

/**
 * Grammaire brutaliste (voir AGENTS.md) : quadrillage noir 2px
 * (`grid gap-[2px] bg-ink p-[2px]`, cellules `bg-paper`), Effra en
 * italique gras pour les titres, libellés en majuscules. Les paliers de don
 * (R2/R3) sont codés par les 4 accents de marque (navy/bottle/ocher/brick,
 * `ACCENTS`/`BG`) — jamais par la palette pop, réservée à la navigation et au
 * statut. `POP_BG` ne reste ici que pour les tuiles de stats 2024 et le
 * repère de faits du bloc d'ask : décoration ponctuelle hors du périmètre
 * arbitré de ce chantier (README, chantier 1, point 3).
 */
const POP_BG = ["bg-pop-pink", "bg-pop-teal", "bg-pop-orange", "bg-pop-yellow"];

/** Microcopie honnête (R7) : le paiement n'ouvre qu'à cette date, jamais un CTA muet. */
const OPENING_MICROCOPY = "Ouverture le 15 août";

/**
 * Vidéo de campagne — le bloc pleine largeur de la maquette 2026-07. Aucune
 * vidéo livrée à ce jour (E10) : renseigner ici l'URL d'embed à réception ;
 * le bloc reste masqué tant que `null`.
 */
const CAMPAIGN_VIDEO_URL: string | null = null;

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
/* Disposition (maquette « essai page souscription », itération        */
/* 2026-07) : la page OUVRE sur la jauge « collecte en direct » +      */
/* objectif, pleine largeur ; slot vidéo (masqué tant que              */
/* CAMPAIGN_VIDEO_URL est null) ; puis corps en deux colonnes — à      */
/* gauche l'ask 2026 (pitch + CTA montant libre + étagère, bloc ink en */
/* tête de récit) suivi de la rétrospective 2024, des chantiers et des */
/* perspectives ; contreparties empilées à droite (`#paliers`). Le     */
/* récit précède les paliers dans le DOM : sur mobile, h1 et pitch     */
/* restent au-dessus des cartes. Catalogue, FAQ et CTA final restent   */
/* en pleine largeur.                                                  */
/*                                                                     */
/* Héros, chantiers, contreparties, mécènes et FAQ sont éditables dans */
/* /admin (global `page-souscription`, spec « éditeur de contenus ») : */
/* lus via `getPageSouscription` — bloc vide = contenu par défaut de   */
/* `lib/site-content-core.ts` (l'ex-contenu en dur de cette page,      */
/* extrait verbatim). `herosTitre`/`herosIntro` décrivent la           */
/* RÉTROSPECTIVE 2024 (2e bloc de la colonne récit, preuve sociale) —  */
/* le pitch 2026 de l'ask est éditorial figé, pas dans le CMS.         */
/* Montant et intitulé des paliers restent dérivés de DONATION_TIERS   */
/* (la table qui pilote Stripe) : la présentation est éditable, jamais */
/* le paiement.                                                        */
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

// Étagère de l'ask : dimensions en pixels des dos de livres dessinés.
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

/** Nombre de couvertures dans le repli mobile (grille 2×4, R7 — l'étagère 3D
 *  ne peut pas disparaître sous `lg` sur une page dont le trafic de campagne
 *  sera majoritairement mobile). */
const MOBILE_SHELF_COUNT = 8;

/**
 * Étagère de l'ask : chaque dos dessiné porte une parution récente réelle. Au
 * survol ou au focus clavier, le livre sort du rayon en 3D : il pivote sur
 * l'arête de sa reliure (bord droit du dos) pour présenter sa couverture,
 * qui glisse vers le haut-gauche hors de l'étagère (translateX/Y/Z + rotateY
 * -78deg, cf. .book3d* dans globals.css). Titre, auteur et collection
 * apparaissent en typo nue sous la barre de l'étagère. CSS pur, aucun JS
 * client. Depuis l'itération maquette 2026-07, l'étagère vit DANS le bloc ink
 * de l'ask (colonne récit) : la couverture dépliée peut recouvrir
 * temporairement le texte au-dessus — même comportement que dans l'ex-héros,
 * où elle glissait vers la colonne de texte.
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
                {book.libelles.length > 0 && (
                  <span className="mt-0.5 block text-xs tracking-wide text-paper/50">
                    {book.libelles.map((l) => l.name).join(" · ")}
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

/**
 * Repli mobile de l'étagère (sous `lg`, où `HeroShelf` est masquée) : une
 * grille 2×4 de vraies couvertures cliquables plutôt qu'un simple texte —
 * l'atout le plus travaillé de la page ne peut pas disparaître pour la
 * majorité du trafic de la campagne. Toujours via `BookCover` : jamais
 * recadrée (`src/components/CLAUDE.md`), donc pas de grille à hauteur de
 * cellule forcée.
 */
function MobileShelf({ books }: { books: Book[] }) {
  const items = books.slice(0, MOBILE_SHELF_COUNT);
  if (items.length === 0) return null;
  return (
    <div className="mt-10 grid grid-cols-4 items-start gap-[2px] bg-paper/15 p-[2px] lg:hidden">
      {items.map((book) => (
        <Link
          key={book.id}
          href={`/catalogue/${book.edition}/${book.slug}`}
          // Anneau EXTÉRIEUR (R5) : posé sur le fond ink du bloc d'ask, pas
          // sur la couverture elle-même — pop-yellow y contraste, et l'anneau
          // ne recouvre jamais l'image.
          className={`group relative block bg-paper-2 ${FOCUS_RING_DARK_OUTER}`}
        >
          <span className="sr-only">
            {book.title}
            {book.authors[0] ? `, ${book.authors[0].name}` : ""}
          </span>
          <BookCover
            cover={book.cover}
            title={book.title}
            alt=""
            fit="width"
            sizes="25vw"
            className="block h-auto w-full transition-opacity group-hover:opacity-90 group-focus-within:opacity-90 motion-reduce:transition-none"
          />
        </Link>
      ))}
    </div>
  );
}

/**
 * Formulaire « montant libre » — rendu deux fois (bloc d'ask, CTA final) avec
 * le même comportement (R7) : avant ouverture, CTA réellement `disabled` +
 * microcopie « Ouverture le 15 août » (jamais un bouton mort qui a l'air
 * cliquable) ; une fois ouvert, `SubmitButton` (`useFormStatus`) distingue
 * l'état pendant la redirection Stripe de l'état bloqué.
 */
function FreeAmountForm({ enabled, idSuffix }: { enabled: boolean; idSuffix: string }) {
  if (!enabled) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex shrink-0 items-center gap-2 border-2 border-paper bg-paper px-7 py-3.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Contribuer
        </button>
        <p className="font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-paper/60">
          {OPENING_MICROCOPY}
        </p>
      </div>
    );
  }
  const inputId = `amount-${idSuffix}`;
  return (
    <form action={createDonationCheckout} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <label htmlFor={inputId} className="sr-only">
        Montant libre, en euros
      </label>
      <input
        id={inputId}
        name="amount"
        type="number"
        min={FREE_AMOUNT.min}
        max={FREE_AMOUNT.max}
        step={1}
        inputMode="numeric"
        placeholder="Montant en €"
        required
        className={`w-36 border-2 border-paper bg-ink px-4 py-3.5 font-sans text-sm font-semibold text-paper placeholder:text-paper/50 ${FOCUS_RING_DARK}`}
      />
      <SubmitButton
        tone="light"
        pendingLabel="Redirection…"
        className={`inline-flex shrink-0 items-center gap-2 border-2 border-paper bg-paper px-7 py-3.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT}`}
      >
        Contribuer
      </SubmitButton>
    </form>
  );
}

export default async function SouscriptionPage() {
  // Interrupteur de la phase dons (E1) : tant que `STRIPE_SECRET_KEY` est
  // absente, la page reste en iso-rendu (CTA honnêtement désactivés, R7).
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
  // L'étagère de l'ask porte de vraies parutions : couverture + fiche interne requises.
  const shelfBooks = releases
    .filter((b) => b.cover && b.edition)
    .slice(0, SPINES.length);
  // Jauge 2026 TOUJOURS visible (point le plus urgent du site, README
  // chantier 1) : avant l'ouverture des dons (pas de clé Stripe → `null`),
  // ou juste après le lancement (0 collecté), la jauge affiche honnêtement
  // une campagne à 0 plutôt que de disparaître.
  const liveCampaign = campaign2026 ?? deriveCampaign2026({ collected: 0, contributors: 0 });

  return (
    <>
      {/* La collecte en direct OUVRE la page — jauge 2026 vivante + objectif,
          pleine largeur (maquette : barre + « OBJECTIF 50 000 € » ; le point
          le plus urgent du site passe littéralement en premier). N'affiche
          que ce qu'une campagne en cours peut honnêtement montrer (collecté
          net + contributeurs), jamais les 4 tuiles `stats` du gabarit 2024
          rétrospectif (piège documenté dans `lib/donation-tiers.ts`/
          `lib/donations.ts`). Fenêtre de fraîcheur ~1–3 min, voir
          `src/app/CLAUDE.md`. */}
      <section className="border-b-2 border-ink bg-paper">
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="flex flex-col gap-[2px] bg-ink p-[2px] lg:flex-row">
              <div className="flex-1 bg-paper p-6 sm:p-8">
                <Eyebrow dot="bg-pop-yellow">La collecte en direct</Eyebrow>
                {liveCampaign.collected > 0 ? (
                  <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[15px] leading-relaxed text-ink/70">
                    Déjà
                    <CountUp
                      value={liveCampaign.collected}
                      suffix=" €"
                      className="font-sans text-lg font-black italic text-ink"
                    />
                    réunis auprès de
                    <CountUp
                      value={liveCampaign.contributors}
                      className="font-sans text-lg font-black italic text-ink"
                    />
                    contributeur·rices.
                  </p>
                ) : (
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink/70">
                    Campagne tout juste lancée — soyez les premier·ères à
                    contribuer.
                  </p>
                )}
                <Gauge
                  className="mt-6"
                  value={liveCampaign.gauge.value}
                  max={liveCampaign.gauge.max}
                  markers={liveCampaign.gauge.markers}
                />
              </div>
              <div className="flex flex-col justify-center bg-ink p-6 text-paper sm:p-8 lg:w-64">
                <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-paper/70">
                  Objectif
                </p>
                <p className="mt-2 font-sans text-4xl font-black italic">
                  {formatInt(liveCampaign.goal)}&nbsp;€
                </p>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Vidéo de campagne — le bloc pleine largeur de la maquette ; absent
          tant qu'aucune vidéo n'est livrée (E10). */}
      {CAMPAIGN_VIDEO_URL && (
        <section className="border-b-2 border-ink bg-paper">
          <Container className="py-12 sm:py-16">
            <Reveal>
              <div className="border-2 border-ink bg-ink">
                <iframe
                  src={CAMPAIGN_VIDEO_URL}
                  title="La vidéo de la souscription"
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </Reveal>
          </Container>
        </section>
      )}

      {/* Corps en deux colonnes (maquette) : récit à gauche — ouvert par
          l'ask 2026 —, contreparties empilées à droite. Le récit est premier
          dans le DOM : sur mobile, h1, pitch et CTA restent au-dessus des
          cartes de paliers. */}
      <section className="border-b-2 border-ink bg-paper">
        <Container className="py-16 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            {/* Colonne récit : l'ask, la preuve, la suite */}
            <div className="flex flex-col gap-14">
              {/* L'ask 2026 — l'ex-héros intégré en tête de récit : pitch,
                  CTA montant libre immédiat, étagère (3D en lg+, grille de
                  couvertures en dessous). Éditorial figé, pas dans le CMS. */}
              <div className="bg-ink p-7 text-paper sm:p-9">
                <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-pop-yellow">
                  Souscription 2026 — campagne de lancement
                </p>
                <h1 className="mt-4 font-sans text-4xl font-black italic leading-[0.98] text-paper">
                  Tenir une édition marxiste{" "}
                  <span className="text-pop-yellow">et indépendante</span>
                </h1>
                <p className="mt-6 text-paper/85">
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

                {/* CTA immédiat : montant libre, avant même le choix d'un palier. */}
                <div className="mt-8">
                  <FreeAmountForm enabled={enabled} idSuffix="hero" />
                </div>

                <div className="mt-14">
                  <HeroShelf books={shelfBooks} />
                </div>
                <MobileShelf books={shelfBooks} />
              </div>

              {/* Rétrospective 2024 — la preuve sociale
                  (l'emplacement « messages de soutien » de la maquette :
                  aucun verbatim n'existe, les faits 2024 tiennent ce rôle). */}
              <div>
                <Reveal>
                  <Eyebrow dot="bg-pop-teal">Ce que 2024 a permis</Eyebrow>
                  <h2 className="mt-3 font-sans text-3xl font-black italic leading-[0.98] text-ink">
                    {content.herosTitre}
                  </h2>
                  <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink/70">
                    {content.herosIntro}
                  </p>
                </Reveal>
                <FramedGrid className="mt-8 sm:grid-cols-2">
                  {CAMPAIGN_2024.stats.map((s, i) => (
                    <Reveal key={s.label} delay={(i % 2) * 120} className="h-full">
                      <div className={`flex h-full flex-col justify-center p-6 ${POP_BG[i % 4]}`}>
                        <CountUp
                          value={s.value}
                          suffix={s.suffix}
                          className="font-sans text-4xl font-black italic text-ink"
                        />
                        <p className="mt-1 text-sm font-semibold text-ink">{s.label}</p>
                      </div>
                    </Reveal>
                  ))}
                </FramedGrid>
                <Reveal delay={200} className="mt-8">
                  <div className="border-2 border-ink bg-paper p-6">
                    <Gauge
                      value={CAMPAIGN_2024.gauge.value}
                      max={CAMPAIGN_2024.gauge.max}
                      markers={CAMPAIGN_2024.gauge.markers}
                    />
                  </div>
                </Reveal>
              </div>

              {/* Les chantiers : où va votre argent */}
              <div>
                <Reveal>
                  <Eyebrow dot="bg-pop-orange">Où va votre argent</Eyebrow>
                  <h2 className="mt-3 font-sans text-3xl font-black italic text-ink">
                    Cinq chantiers pour la suite
                  </h2>
                </Reveal>
                <FramedGrid className="mt-8 grid-cols-1">
                  {content.chantiers.map((c, i) => (
                    <Reveal key={c.titre} className="h-full">
                      <div className="flex h-full gap-5 bg-paper p-6">
                        <span className={`font-sans text-3xl font-black italic ${TEXT[c.accent]}`}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <h3 className="font-sans text-xl font-black italic text-ink">{c.titre}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-ink/70">{c.desc}</p>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </FramedGrid>
              </div>

              {/* Et après : les perspectives des deux maisons — la suite */}
              <div>
                <Reveal>
                  <Eyebrow dot="bg-pop-teal">Et après</Eyebrow>
                  <h2 className="mt-3 font-sans text-3xl font-black italic text-ink">
                    Des projets, on en a plein
                  </h2>
                </Reveal>
                <FramedGrid className="mt-8 grid-cols-1">
                  {MAISONS.map((m) => (
                    <Reveal key={m.nom} className="h-full">
                      <div className="flex h-full flex-col bg-paper">
                        <div aria-hidden="true" className={`h-2 ${BG[m.accent]}`} />
                        <div className="flex flex-1 flex-col p-7">
                          <h3 className={`font-sans text-2xl font-black italic ${TEXT[m.accent]}`}>
                            {m.nom}
                          </h3>
                          <p className="mt-3 flex-1 text-sm leading-relaxed text-ink/70">{m.desc}</p>
                          <div className="mt-5 flex flex-wrap gap-2">
                            {m.chips.map((chip) => (
                              <span
                                key={chip}
                                className="border border-ink px-3 py-1 font-sans text-xs font-bold uppercase tracking-[.03em] text-ink"
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
              </div>
            </div>

            {/* Colonne contreparties */}
            <aside id="paliers">
              <FramedGrid className="grid-cols-1">
                {content.contreparties.map((p, i) => {
                  // Paliers de don : les 4 accents de marque, jamais le cycle pop
                  // (R2/R3 — README, chantier 1, point 3).
                  const accentBg = BG[ACCENTS[i % 4]];
                  return (
                    <Reveal key={p.tier.id} className="h-full">
                      <div className="relative flex h-full flex-col bg-paper">
                        <div aria-hidden="true" className={`h-2 ${accentBg}`} />
                        {p.populaire && (
                          <span className="bg-ink px-3 py-1.5 text-center font-sans text-[10px] font-extrabold uppercase tracking-[.08em] text-pop-yellow">
                            Le plus choisi en 2024
                          </span>
                        )}
                        <div className="flex flex-1 flex-col p-6">
                          <span className="font-sans text-4xl font-black italic text-ink">
                            {p.tier.amount}&nbsp;€
                          </span>
                          <span className="mt-1 font-sans text-sm font-extrabold uppercase tracking-[.02em] text-ink">
                            {p.tier.title}
                          </span>
                          <ul className="mt-4 flex-1 space-y-2 text-sm text-ink/70">
                            {p.items.map((item) => (
                              <li key={item} className="flex gap-2.5">
                                <span
                                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 ${accentBg}`}
                                />
                                {item}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-4 font-sans text-xs font-bold uppercase tracking-[.04em] text-muted">
                            {p.soutiens2024} soutiens en 2024
                          </p>
                          {enabled ? (
                            <form
                              action={createDonationCheckout}
                              className="contents"
                            >
                              <input type="hidden" name="tierId" value={p.tier.id} />
                              <SubmitButton
                                tone="dark"
                                pendingLabel="Redirection…"
                                ariaLabel={`Contribuer ${p.tier.amount} € — ${p.tier.title}`}
                                className={`mt-3 inline-flex items-center justify-center gap-2 border-2 border-ink bg-ink px-4 py-2.5 font-sans text-sm font-bold uppercase tracking-[.03em] text-paper transition-colors motion-reduce:transition-none hover:bg-paper hover:text-ink ${FOCUS_RING_DARK}`}
                              >
                                Contribuer
                              </SubmitButton>
                            </form>
                          ) : (
                            <div className="mt-3 flex flex-col items-start gap-1.5">
                              <Button
                                type="button"
                                variant="solid"
                                disabled
                                aria-disabled="true"
                                className="px-4 py-2.5 text-sm tracking-[.03em]"
                              >
                                Contribuer
                              </Button>
                              <p className="font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-muted">
                                {OPENING_MICROCOPY}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </FramedGrid>
              {/* Grands paliers : cartes inversées */}
              <FramedGrid className="mt-[2px] grid-cols-1">
                {content.mecenes.map((p) => (
                  <Reveal key={p.tier.id} className="h-full">
                    <div className="relative flex h-full flex-col overflow-hidden bg-ink p-8 text-paper">
                      <div className="absolute inset-x-0 top-0 grid h-1.5 grid-cols-4" aria-hidden="true">
                        {ACCENTS.map((a) => (
                          <div key={a} className={BG[a]} />
                        ))}
                      </div>
                      <span className="font-sans text-5xl font-black italic text-paper">
                        {p.tier.amount.toLocaleString("fr-FR")}&nbsp;€
                      </span>
                      <span className="mt-1 font-sans text-lg font-extrabold uppercase tracking-[.02em] text-paper/90">
                        {p.tier.title}
                      </span>
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-paper/80">{p.desc}</p>
                      <p className="mt-4 font-sans text-xs font-bold uppercase tracking-[.04em] text-paper/60">
                        {p.soutiens2024} soutiens en 2024
                      </p>
                      {enabled ? (
                        <form action={createDonationCheckout}>
                          <input type="hidden" name="tierId" value={p.tier.id} />
                          {/* Piège R12 : ce bouton était un <button type="button"> nu — dans
                              un <form>, il ne soumettrait jamais sans ce passage en "submit"
                              (`SubmitButton` le pose toujours). */}
                          <SubmitButton
                            tone="light"
                            pendingLabel="Redirection…"
                            ariaLabel={`Contribuer ${p.tier.amount.toLocaleString("fr-FR")} € — ${p.tier.title}`}
                            className={`mt-3 inline-flex items-center gap-2 self-start border-2 border-paper bg-paper px-6 py-2.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT}`}
                          >
                            Contribuer
                          </SubmitButton>
                        </form>
                      ) : (
                        <div className="mt-3 flex flex-col items-start gap-1.5">
                          <button
                            type="button"
                            disabled
                            aria-disabled="true"
                            className="inline-flex items-center gap-2 self-start border-2 border-paper bg-paper px-6 py-2.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-ink disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Contribuer
                          </button>
                          <p className="font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-paper/60">
                            {OPENING_MICROCOPY}
                          </p>
                        </div>
                      )}
                    </div>
                  </Reveal>
                ))}
              </FramedGrid>
            </aside>
          </div>
        </Container>
      </section>

      {/* Aperçu du catalogue */}
      {newReleases.length > 0 && (
        <section className="border-b-2 border-ink bg-paper">
          <Container className="py-16">
            <Reveal>
              <div className="mb-8 flex items-end justify-between">
                <div>
                  <h2 className="font-sans text-2xl font-black italic text-ink">
                    En attendant, le catalogue vous attend
                  </h2>
                  <p className="mt-1 text-ink/70">
                    Dernières parutions des deux fonds réunis.
                  </p>
                </div>
                <Link
                  href="/catalogue"
                  className={`shrink-0 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-ink hover:underline ${FOCUS_RING_LIGHT}`}
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
      <section className="bg-paper">
        <Container className="max-w-3xl py-16 sm:py-20">
          <Reveal>
            <Eyebrow dot="bg-pop-yellow">FAQ</Eyebrow>
            <h2 className="mt-3 font-sans text-3xl font-black italic text-ink">
              Questions fréquentes
            </h2>
          </Reveal>
          <div className="mt-8 divide-y-2 divide-ink border-2 border-ink">
            {content.faq.map((item, i) => (
              <Reveal key={item.q} delay={i * 80}>
                <details className="group bg-paper">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-sans font-bold text-ink [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      className="shrink-0 font-sans text-xl leading-none text-pop-orange transition-transform group-open:rotate-45"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-ink/70">{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA final */}
      <section className="bg-ink text-paper">
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
            <p className="mt-2 text-paper/75">
              En 2024, vous étiez 958. Cette fois, chaque contribution va
              intégralement à la maison.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <FreeAmountForm enabled={enabled} idSuffix="final" />
            <a
              href="#paliers"
              className={`shrink-0 border-2 border-paper bg-paper px-7 py-3.5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-ink transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT}`}
            >
              Choisir un palier
            </a>
          </div>
        </Container>
      </section>
    </>
  );
}
