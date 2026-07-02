import type { Metadata } from "next";
import Link from "next/link";
import type { Book } from "@/lib/types";
import { Container } from "@/components/container";
import { BookGrid } from "@/components/book-grid";
import { ShelfCover } from "@/components/shelf-cover";
import { ShelfLock } from "@/components/shelf-lock";
import { CountUp } from "@/components/count-up";
import { Gauge } from "@/components/gauge";
import { Reveal } from "@/components/reveal";
import { getNewReleases, countBooks } from "@/lib/catalogue";
import { coverAspectRatio } from "@/lib/cover";
import { ColorStripe } from "@/components/color-stripe";
import type { Accent } from "@/lib/format";
import {
  ACCENTS,
  ACCENT_BG as BG,
  ACCENT_TEXT as TEXT,
  ACCENT_BORDER_T as BORDER_T,
  ACCENT_BORDER_L as BORDER_L,
} from "@/lib/accents";

export const metadata: Metadata = {
  title: "Souscription",
  description:
    "Face à la concentration capitaliste de l'édition, Les Éditions sociales et La Dispute tiennent deux catalogues marxistes et critiques — Marx et Engels, savoirs populaires, féminismes matérialistes —, sans mécène ni actionnaire. Une souscription pour continuer. Contreparties de 15 à 1 000 €.",
};

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Contenu repris de la campagne Ulule 2024                            */
/* « Sauvez les Éditions sociales et La Dispute »                      */
/* ------------------------------------------------------------------ */

// Résultats finaux de la campagne (source : API Ulule).
const CAMPAGNE_2024 = {
  collecte: 85305,
  objectifInitial: 50000,
  contributeurs: 958,
  messages: 419,
  pourcentObjectif: 170,
};

const STATS_2024: { valeur: number; suffixe: string; label: string }[] = [
  { valeur: CAMPAGNE_2024.collecte, suffixe: " €", label: "collectés en 39 jours" },
  { valeur: CAMPAGNE_2024.contributeurs, suffixe: "", label: "contributeur·rices" },
  { valeur: CAMPAGNE_2024.pourcentObjectif, suffixe: " %", label: "de l'objectif initial" },
  { valeur: CAMPAGNE_2024.messages, suffixe: "", label: "messages de soutien" },
];

const PALIERS_2024 = [
  { value: 50000, label: "Survie", reached: true },
  { value: 75000, label: "Consolidation", reached: true },
  { value: 100000, label: "Déploiement", reached: false },
];

// Les grands chantiers financés par la souscription (repris de la campagne).
const CHANTIERS: { titre: string; desc: string; accent: Accent }[] = [
  {
    titre: "Consolider l'équipe",
    desc: "Trois éditrices permanentes pour tenir notre rythme de publication et renforcer le travail en direction des libraires et de la presse — indispensable pour défendre nos livres.",
    accent: "navy",
  },
  {
    titre: "Réimprimer les épuisés",
    desc: "Pensée et langage de Vygotski, l'Histoire de la Révolution française de Jaurès, la tétralogie de Lucien Sève, Le travail bénévole de Maud Simonet, les « Découvrir »… Plus de 400 titres aux catalogues, et trop d'épuisés.",
    accent: "brick",
  },
  {
    titre: "Passer au numérique",
    desc: "Doubler le nombre de titres disponibles sur Cairn et proposer enfin nos livres au format numérique.",
    accent: "bottle",
  },
  {
    titre: "Sillonner les librairies",
    desc: "Une tournée des librairies indépendantes — elles jouent un rôle décisif pour défendre nos livres — et des initiatives multipliées, dans et hors les murs.",
    accent: "ocher",
  },
  {
    titre: "Achever ce site",
    desc: "Un catalogue unifié, une boutique en ligne sans intermédiaire, l'impression des ouvrages à paraître : l'outil que vous avez sous les yeux, à finir de construire.",
    accent: "navy",
  },
];

// Contreparties reprises de la campagne 2024, avec leur succès d'alors.
const CONTREPARTIES: {
  montant: number;
  titre: string;
  items: string[];
  soutiens2024: number;
  populaire?: boolean;
}[] = [
  {
    montant: 15,
    titre: "Le coup de pouce",
    items: ["Une planche de stickers ou un lot de marque-pages au choix"],
    soutiens2024: 108,
  },
  {
    montant: 35,
    titre: "Petit mais irremplaçable",
    items: [
      "Un livre « petit mais irremplaçable » au choix",
      "Stickers ou marque-pages",
    ],
    soutiens2024: 69,
  },
  {
    montant: 50,
    titre: "L'essentiel",
    items: [
      "Un livre « essentiel » au choix",
      "Un sac « Make marxism great again » ou un carnet « Pour des savoirs populaires »",
      "Stickers ou marque-pages",
    ],
    soutiens2024: 257,
    populaire: true,
  },
  {
    montant: 75,
    titre: "L'indispensable",
    items: [
      "Un livre « indispensable » au choix",
      "Sac ou carnet au choix",
      "Stickers ou marque-pages",
    ],
    soutiens2024: 27,
  },
  {
    montant: 100,
    titre: "L'incontournable",
    items: [
      "Un « incontournable » au choix",
      "Sac ou carnet au choix",
      "Stickers ou marque-pages",
    ],
    soutiens2024: 63,
  },
  {
    montant: 150,
    titre: "Le très grand format",
    items: [
      "Un très grand format au choix — ou une affiche de Dugudus",
      "Sac ou carnet au choix",
      "Stickers ou marque-pages",
    ],
    soutiens2024: 24,
  },
  {
    montant: 200,
    titre: "Les nouveautés",
    items: [
      "Deux nouveautés de notre programmation au choix",
      "Sac ou carnet au choix",
      "Stickers ou marque-pages",
    ],
    soutiens2024: 15,
  },
  {
    montant: 300,
    titre: "Le grand lot",
    items: [
      "Un lot de grands livres au choix",
      "Sac ou carnet au choix",
      "Stickers ou marque-pages",
    ],
    soutiens2024: 9,
  },
];

const MECENES: { montant: number; titre: string; desc: string; soutiens2024: number }[] = [
  {
    montant: 500,
    titre: "La rencontre",
    desc: "Une rencontre exceptionnelle avec vos éditrices, les membres des bureaux éditoriaux et certain·es de nos auteur·ices — sac ou carnet, stickers et marque-pages compris.",
    soutiens2024: 4,
  },
  {
    montant: 1000,
    titre: "L'intégrale",
    desc: "On prend directement contact avec vous pour vous offrir les livres que vous voulez dans nos catalogues — ou l'intégrale de la GEME, la Grande édition Marx-Engels.",
    soutiens2024: 5,
  },
];

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

const FAQ = [
  {
    q: "À quoi va servir ma contribution ?",
    a: "À consolider l'équipe des maisons, réimprimer les titres épuisés, développer le numérique, aller à la rencontre des libraires — et financer ce nouveau site, son catalogue unifié et sa boutique en ligne, ainsi que l'impression des ouvrages à paraître.",
  },
  {
    q: "Que devient la campagne Ulule de 2024 ?",
    a: "Elle s'est achevée en juillet 2024 à 170 % de son objectif : 85 305 € collectés auprès de 958 contributeur·rices. Elle a permis aux deux maisons de passer le cap. Cette nouvelle souscription est hébergée directement sur notre site : pas de commission de plateforme, 100 % pour la maison.",
  },
  {
    q: "Quand le nouveau site sera-t-il en ligne ?",
    a: "Le catalogue et la page de souscription ouvrent dès maintenant ; la boutique intégrée suit dans un second temps.",
  },
  {
    q: "Puis-je choisir mes livres dans les contreparties ?",
    a: "Oui, une sélection vous sera proposée après votre contribution, pour chaque palier comprenant des livres.",
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
  const [releases, totalBooks] = await Promise.all([
    getNewReleases(18),
    countBooks(),
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
      <section className="border-b border-line">
        <Container className="py-16 sm:py-24">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-bottle">
              Nous soutenir
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-3xl font-semibold sm:text-4xl">
              En 2024, vous avez sauvé nos maisons
            </h1>
            <p className="mt-4 max-w-2xl text-ink-soft">
              En deux semaines, la campagne « Sauvez les Éditions sociales et
              La Dispute » atteignait les 50&nbsp;000&nbsp;€ nécessaires pour
              sortir la tête de l&apos;eau. À l&apos;arrivée, l&apos;objectif
              était dépassé de loin. Cette solidarité a tout changé — et cette
              nouvelle souscription en écrit la suite.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STATS_2024.map((s, i) => (
              <Reveal key={s.label} delay={i * 120}>
                <div>
                  <CountUp
                    value={s.valeur}
                    suffix={s.suffixe}
                    className={`font-serif text-5xl font-semibold ${TEXT[ACCENTS[i % 4]]}`}
                  />
                  <p className="mt-1 text-sm text-ink-soft">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200} className="mt-12">
            <Gauge
              value={CAMPAGNE_2024.collecte}
              max={100000}
              markers={PALIERS_2024}
            />
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
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-paper/70">
                Souscription de lancement
              </p>
              <h2 className="mt-4 max-w-3xl font-serif text-3xl font-semibold leading-[1.1] sm:text-5xl">
                Tenir une édition marxiste{" "}
                <span className="text-ocher">et indépendante</span>
              </h2>
              <p className="mt-6 max-w-2xl text-paper/85">
                Deux catalogues marxistes et critiques, une seule petite équipe
                d&apos;éditrices, et un principe : rester indépendants face à la
                poignée de groupes capitalistes qui accaparent l&apos;édition, la
                diffusion et les médias. Sans mécène ni actionnaire, nous vivons
                de la vente de nos livres — et, pour tenir, de cette souscription.
              </p>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-paper/80">
                {[
                  `${totalBooks} titres au catalogue`,
                  "Le plus grand fonds marxiste en français",
                  "Sans mécène ni actionnaire",
                ].map((label, i) => (
                  <span key={label} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rotate-45 ${BG[ACCENTS[i % 4]]}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <HeroShelf books={shelfBooks} />
          </div>
        </Container>
      </section>

      {/* Contreparties */}
      <section id="paliers">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-navy">
              Les paliers
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
              Choisissez votre contrepartie
            </h2>
            <p className="mt-4 max-w-2xl text-ink-soft">
              Les contreparties de notre campagne 2024, de retour pour la
              souscription de lancement. Contributions directes, sans
              intermédiaire — 100&nbsp;% pour la maison. Et bien sûr, notre
              reconnaissance éternelle est comprise dans tous les paliers.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CONTREPARTIES.map((p, i) => {
              const accent = ACCENTS[i % 4];
              return (
                <Reveal key={p.montant} delay={(i % 4) * 90} className="h-full">
                  <div
                    className={`relative flex h-full flex-col rounded-xl border border-line border-t-4 bg-paper p-6 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/5 ${BORDER_T[accent]}`}
                  >
                    {p.populaire && (
                      <span className="absolute -top-3.5 right-4 rounded-full bg-ocher px-3 py-1 text-xs font-semibold text-ink">
                        Le plus choisi en 2024
                      </span>
                    )}
                    <span className={`font-serif text-4xl font-semibold ${TEXT[accent]}`}>
                      {p.montant}&nbsp;€
                    </span>
                    <span className="mt-1 font-semibold">{p.titre}</span>
                    <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-soft">
                      {p.items.map((item) => (
                        <li key={item} className="flex gap-2.5">
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 ${BG[accent]}`}
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-xs text-muted">
                      {p.soutiens2024} soutiens en 2024
                    </p>
                    <button
                      type="button"
                      className="mt-3 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90"
                    >
                      Contribuer
                    </button>
                  </div>
                </Reveal>
              );
            })}
          </div>
          {/* Grands paliers : cartes inversées */}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {MECENES.map((p, i) => (
              <Reveal key={p.montant} delay={i * 120} className="h-full">
                <div className="relative flex h-full flex-col overflow-hidden rounded-xl bg-ink p-8 text-paper transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/20">
                  <div className="absolute inset-x-0 top-0 grid h-1.5 grid-cols-4" aria-hidden="true">
                    {ACCENTS.map((a) => (
                      <div key={a} className={BG[a]} />
                    ))}
                  </div>
                  <span className="font-serif text-5xl font-semibold">
                    {p.montant.toLocaleString("fr-FR")}&nbsp;€
                  </span>
                  <span className="mt-1 text-lg font-semibold text-paper/90">{p.titre}</span>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-paper/80">{p.desc}</p>
                  <p className="mt-4 text-xs text-paper/60">
                    {p.soutiens2024} soutiens en 2024
                  </p>
                  <button
                    type="button"
                    className="mt-3 self-start rounded-full bg-paper px-6 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
                  >
                    Contribuer
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Les chantiers : où va votre argent */}
      <section className="border-y border-line bg-paper-2">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-ocher-text">
              Où va votre argent
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
              Cinq chantiers pour la suite
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-6">
            {CHANTIERS.map((c, i) => (
              <Reveal
                key={c.titre}
                delay={i * 100}
                className={i < 3 ? "lg:col-span-2" : "lg:col-span-3"}
              >
                <div className="flex h-full flex-col rounded-xl border border-line bg-paper p-6">
                  <span className={`font-serif text-3xl font-semibold ${TEXT[c.accent]}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 font-serif text-xl font-semibold">{c.titre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Et après : les perspectives des deux maisons — la suite */}
      <section className="border-t border-line">
        <Container className="py-16 sm:py-20">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-bottle">
              Et après
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
              Des projets, on en a plein
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {MAISONS.map((m, i) => (
              <Reveal key={m.nom} delay={i * 120} className="h-full">
                <div
                  className={`flex h-full flex-col rounded-xl border border-line border-l-4 bg-paper p-7 ${BORDER_L[m.accent]}`}
                >
                  <h3 className={`font-serif text-2xl font-semibold ${TEXT[m.accent]}`}>
                    {m.nom}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-soft">{m.desc}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {m.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full bg-paper-2 px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-inset ring-line"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Aperçu du catalogue */}
      {newReleases.length > 0 && (
        <section className="border-t border-line bg-paper-2">
          <Container className="py-16">
            <Reveal>
              <div className="mb-8 flex items-end justify-between">
                <div>
                  <h2 className="font-serif text-2xl font-semibold">
                    En attendant, le catalogue vous attend
                  </h2>
                  <p className="mt-1 text-ink-soft">
                    Dernières parutions des deux fonds réunis.
                  </p>
                </div>
                <Link
                  href="/catalogue"
                  className="text-sm font-semibold text-ink hover:underline"
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
      <section className="border-t border-line">
        <Container className="max-w-3xl py-16 sm:py-20">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brick">
              FAQ
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold">
              Questions fréquentes
            </h2>
          </Reveal>
          <div className="mt-8 space-y-3">
            {FAQ.map((item, i) => (
              <Reveal key={item.q} delay={i * 80}>
                <details className="group rounded-xl border border-line bg-paper open:bg-paper-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      className={`shrink-0 font-serif text-xl leading-none transition-transform group-open:rotate-45 ${TEXT[ACCENTS[i % 4]]}`}
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-ink-soft">{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA final */}
      <section className="bg-ink text-paper">
        <ColorStripe />
        <Container className="flex flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-semibold sm:text-3xl">
              Prêt·e à écrire la suite avec nous&nbsp;?
            </h2>
            <p className="mt-2 text-paper/75">
              En 2024, vous étiez 958. Cette fois, chaque contribution va
              intégralement à la maison.
            </p>
          </div>
          <a
            href="#paliers"
            className="shrink-0 rounded-full bg-paper px-7 py-3.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5 hover:bg-paper/90"
          >
            Choisir un palier
          </a>
        </Container>
      </section>
    </>
  );
}
