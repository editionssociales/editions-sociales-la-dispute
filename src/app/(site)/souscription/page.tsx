import type { Metadata } from "next";
import type { Book } from "@/lib/types";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { Container } from "@/components/container";
import { FramedGrid } from "@/components/framed-grid";
import { Button } from "@/components/button";
import { SubmitButton } from "@/components/submit-button";
import { ShelfLock } from "@/components/shelf-lock";
import { ShelfCover } from "@/components/shelf-cover";
import { CountUp } from "@/components/count-up";
import { Gauge } from "@/components/gauge";
import { Reveal } from "@/components/reveal";
import { BookCover, coverAspectRatio } from "@/lib/cover";
import { formatInt } from "@/lib/format";
import { ACCENTS, ACCENT_BG as BG } from "@/lib/accents";
import { FOCUS_RING_DARK, FOCUS_RING_DARK_OUTER, FOCUS_RING_LIGHT } from "@/lib/ui";
import { donationsEnabled } from "@/lib/stripe";
import { FREE_AMOUNT, deriveCampaign2026 } from "@/lib/donation-tiers";
import { getCampaign2026 } from "@/lib/donations";
import { getNewReleases } from "@/lib/catalogue";
import { getPageSouscription } from "@/lib/site-content";
import { createDonationCheckout } from "./actions";

// Visuels de contreparties (9 montages produits, fond blanc, sans texte) —
// assets de campagne pilotés par la table `DONATION_TIERS` (code), donc
// versionnés dans le repo et importés STATIQUEMENT plutôt que via la
// collection Media : le pattern « bloc CMS vide = défaut en code » interdit
// de faire dépendre le rendu par défaut d'uploads en base. `next/image`
// optimise à la volée depuis l'import statique (`StaticImageData`).
import coupDePouceImg from "./_contreparties/coup-de-pouce.jpg";
import coupDeMainImg from "./_contreparties/coup-de-main.jpg";
import camaradeDeLectureImg from "./_contreparties/camarade-de-lecture.jpg";
import camaradeFideleImg from "./_contreparties/camarade-fidele.jpg";
import camaradeDeLutteImg from "./_contreparties/camarade-de-lutte.jpg";
import camaradeDeLaPremiereHeureImg from "./_contreparties/camarade-de-la-premiere-heure.jpg";
import camaradeInfatigableImg from "./_contreparties/camarade-infatigable.jpg";
import camaradeDHonneurImg from "./_contreparties/camarade-d-honneur.jpg";
import camaradePourLaVieImg from "./_contreparties/camarade-pour-la-vie.jpg";

/**
 * Page /souscription — livraison définitive de la campagne 2026 (Clara,
 * 2026-07-24) : docx « Souscription - texte » (récit, slogan), xlsx +
 * PDF « contreparties dans l'ordre » (9 paliers, visuels), objectifs de
 * jauge. Consigne client explicite : ne garder AUCUNE section qui ne soit
 * pas un extrait de ces documents, rendu le plus épuré possible — zéro
 * métadonnée visible (pas d'eyebrow, pas de titre de section générique type
 * « Contreparties »/« FAQ », pas de mot-clé de navigation). Seuls les
 * intertitres du document client et la microcopie fonctionnelle (boutons,
 * mention d'ouverture) sont affichés.
 *
 * Sections de l'ancienne maquette (campagne Ulule 2024) supprimées à
 * dessein, aucune ne correspondant à un extrait des documents livrés :
 * rétrospective 2024 (héros + tuiles de stats + jauge 2024), « Cinq
 * chantiers pour la suite », « Des projets, on en a plein » (perspectives
 * des maisons), FAQ, aperçu catalogue. `lib/campaign.ts` reste intact
 * (`deriveGauge` est le socle commun 2024/2026), seul son usage sur cette
 * page disparaît. L'étagère 3D, elle, N'EST PAS un reliquat 2024 : elle est
 * réintégrée dans l'ask (voir plus bas), avec de vraies parutions 2026.
 *
 * Ce qui reste, dans l'ordre du DOM (retour client 2026-07-24) : colonne
 * principale — jauge de collecte en direct (TOUJOURS visible, CTA
 * « Contribuer » ancré vers `#paliers`, sans séparation sous la jauge),
 * corps de texte ouvert par le slot vidéo (placeholder tant qu'aucune vidéo
 * n'est livrée) puis ask — h1, lien d'ancre mobile vers `#paliers`, étagère
 * 3D des dernières parutions (preuve matérielle du slogan, 3D en lg+, repli
 * en grille de couvertures 2×4 sous `lg`) —, quatre sections narratives,
 * objectifs de jauge, CTA final — ; contreparties éditables en rail sticky à
 * droite de la PAGE ENTIÈRE (`#paliers`, hors du corps de texte), clôturé
 * par la carte « montant libre » (le formulaire ne vit plus ni dans l'ask ni
 * dans le CTA final). Seul le bloc
 * `contreparties` est éditable dans /admin (global `page-souscription`) :
 * lu via `getPageSouscription`, bloc vide = contenu par défaut de
 * `lib/site-content-core.ts`. Montant et intitulé des paliers restent
 * dérivés de `DONATION_TIERS` (la table qui pilote Stripe) : la présentation
 * est éditable, jamais le paiement.
 */

/**
 * Contreparties (R2/R3) : cycle des 4 accents de marque, jamais la palette
 * pop (réservée nav/statut). `POP_BG` ne reste ici que pour le liseré de
 * statut du CTA final (décoration ponctuelle, hors paliers).
 */
const POP_BG = ["bg-pop-pink", "bg-pop-teal", "bg-pop-orange", "bg-pop-yellow"];

/** Microcopie honnête (R7) : le paiement n'ouvre qu'à cette date, jamais un CTA muet. */
const OPENING_MICROCOPY = "Ouverture le 15 août";

/**
 * Vidéo de présentation — ouvre le corps de texte (retour client
 * 2026-07-24). Aucune vidéo livrée à ce jour : renseigner ici l'URL d'embed
 * à réception ; en attendant, un placeholder au format vidéo tient la place
 * (jamais un vide).
 */
const CAMPAIGN_VIDEO_URL: string | null = null;

/**
 * Visuel par palier (PDF client, montages produits fond blanc) — keyé par
 * id de `DONATION_TIERS`.
 *
 * TODO(visuel) : le visuel « coup de pouce » (et la planche de stickers
 * présente dans tous les montages) est un rectangle crème VIDE — la planche
 * n'est pas encore dessinée ; visuels à re-livrer par Clara.
 */
const TIER_IMAGES: Record<string, StaticImageData> = {
  // Les deux premiers visuels sont recadrés à la source (trim sharp des
  // marges blanches du montage, l'ombre portée fait partie du cadrage) :
  // ils s'affichent en variante compacte, cf. `COMPACT_TIERS`.
  "palier-15": coupDePouceImg,
  "palier-35": coupDeMainImg,
  "palier-50": camaradeDeLectureImg,
  "palier-75": camaradeFideleImg,
  "palier-100": camaradeDeLutteImg,
  "palier-200": camaradeDeLaPremiereHeureImg,
  "palier-300": camaradeInfatigableImg,
  "palier-500": camaradeDHonneurImg,
  "palier-1000": camaradePourLaVieImg,
};

/**
 * Cartes compactes (retour client 2026-07-24) : les petits lots (un sticker,
 * un livre) n'ont pas à occuper la même hauteur que les grands montages —
 * l'illustration, réduite, vient se loger à droite du montant/intitulé pour
 * combler le vide, au lieu d'un bandeau pleine largeur.
 */
const COMPACT_TIERS = new Set(["palier-15", "palier-35"]);

/**
 * Objectifs de la jauge (docx client, définitifs) — cellules encadrées après
 * le récit. La progression sauver → résister → construire est portée par la
 * barre d'accent (brick → ocher → bottle, même échelle que les sections du
 * récit) ; la cellule du sommet (« On construit », l'objectif plein) est la
 * seule inversée en ink.
 */
const OBJECTIFS: {
  montant: string;
  titre: string;
  desc: string;
  accent: string;
  sommet?: boolean;
}[] = [
  {
    montant: "50 000 €",
    titre: "On sauve les meubles",
    desc: "Ce premier palier nous permet de préserver nos emplois et de continuer notre activité.",
    accent: "bg-brick",
  },
  {
    montant: "80 000 €",
    titre: "On résiste",
    desc: "Nous pouvons absorber l'essentiel de la perte, mener à bien les projets déjà engagés et confirmer l'arrivée de Nicolas Vieillescazes dans l'équipe.",
    accent: "bg-ocher",
  },
  {
    montant: "100 000 €",
    titre: "On construit",
    // TODO(contenu) : phrase possiblement tronquée dans le docx (le point
    // final manque) — conservée telle quelle.
    desc: "Nous pouvons investir dans une toute nouvelle collection et continuer à faire vivre nos maisons",
    accent: "bg-bottle",
    sommet: true,
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

export const metadata: Metadata = {
  title: "Souscription",
  description:
    "En 2027, Les Éditions sociales et La Dispute fêteront cent ans d'édition marxiste et critique — mais la faillite de leur distributeur Makassar menace leur activité. Une souscription pour traverser la crise et préserver notre indépendance, avec des contreparties de 15 à 1 000 €.",
  alternates: { canonical: "/souscription" },
};

export const revalidate = 3600; // fenêtre ISR (contreparties lues dans Payload/Postgres)

/**
 * Bouton Contribuer désactivé + microcopie d'ouverture — partagé par
 * `FreeAmountForm` et les cartes de paliers avant l'ouverture des dons
 * (comportement R7 : CTA réellement `disabled`, jamais un bouton mort qui a
 * l'air cliquable). `className` porte la seule variation entre appelants (la
 * marge au-dessus de l'ensemble : `mt-3` en carte de palier, `mt-4` dans
 * `FreeAmountForm`).
 */
function ClosedCta({ className }: { className: string }) {
  return (
    <div className={`flex flex-col items-start gap-1.5 ${className}`}>
      <Button
        type="button"
        variant="solid"
        disabled
        aria-disabled="true"
        className="min-h-11 px-4 py-2.5 text-sm tracking-[.03em]"
      >
        Contribuer
      </Button>
      <p className="font-sans text-[11px] font-semibold uppercase tracking-[.04em] text-muted">
        {OPENING_MICROCOPY}
      </p>
    </div>
  );
}

/**
 * Formulaire « montant libre » — rendu une seule fois, dans la carte qui
 * clôt la liste des contreparties (retour client 2026-07-24 : plus ni dans
 * l'ask ni dans le CTA final). Avant ouverture, `ClosedCta` porte le
 * comportement R7 ; une fois ouvert, `SubmitButton` (`useFormStatus`)
 * distingue l'état pendant la redirection Stripe de l'état bloqué. Recette
 * visuelle alignée sur les cartes de paliers (fond paper, bouton solid).
 */
function FreeAmountForm({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return <ClosedCta className="mt-4" />;
  }
  return (
    <form action={createDonationCheckout} className="mt-4 flex flex-col gap-3">
      <label htmlFor="amount-libre" className="sr-only">
        Montant libre, en euros
      </label>
      <input
        id="amount-libre"
        name="amount"
        type="number"
        min={FREE_AMOUNT.min}
        max={FREE_AMOUNT.max}
        step={1}
        inputMode="numeric"
        placeholder="Montant en €"
        required
        className={`min-h-11 w-full border-2 border-ink bg-paper px-4 py-3 font-sans text-sm font-semibold text-ink placeholder:text-ink/50 ${FOCUS_RING_LIGHT}`}
      />
      <SubmitButton
        tone="dark"
        pendingLabel="Redirection…"
        ariaLabel="Contribuer — montant libre"
        className={`min-h-11 inline-flex items-center justify-center gap-2 border-2 border-ink bg-ink px-4 py-2.5 font-sans text-sm font-bold uppercase tracking-[.03em] text-paper transition-colors motion-reduce:transition-none hover:bg-paper hover:text-ink ${FOCUS_RING_DARK}`}
      >
        Contribuer
      </SubmitButton>
    </form>
  );
}

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
            // Anneau focus fait main (exception R5) : les dos font 20-36px de
            // large, un anneau EXTÉRIEUR pop-yellow (FOCUS_RING_DARK_OUTER) y
            // déborderait de 20-36px ; ocher INTÉRIEUR contraste sur la
            // couverture sans jamais dépasser du dos (choix de cadrage d'origine).
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
                  <span className="block text-sm text-paper/70">
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
    <div
      className="mt-10 grid grid-cols-4 items-start gap-[2px] bg-paper/15 p-[2px] lg:hidden"
      role="group"
      aria-label="Dernières parutions"
    >
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

export default async function SouscriptionPage() {
  // Interrupteur de la phase dons (E1) : tant que `STRIPE_SECRET_KEY` est
  // absente, la page reste en iso-rendu (CTA honnêtement désactivés, R7).
  const enabled = donationsEnabled();
  // `getCampaign2026()` ne fait aucun appel réseau tant que `donationsEnabled()`
  // est faux (elle jette avant tout fetch, absorbée en `null` — `lib/donations.ts`) :
  // gratuit à appeler inconditionnellement.
  const [campaign2026, content, releases] = await Promise.all([
    getCampaign2026(),
    getPageSouscription(),
    // Fail-open : une panne catalogue dégrade l'étagère de l'ask vers ses dos
    // placeholder colorés (HeroShelf/MobileShelf sans `book.cover`) — elle ne
    // fait JAMAIS tomber la page de dons.
    getNewReleases(18).catch(() => []),
  ]);
  // L'étagère de l'ask porte de vraies parutions : couverture + fiche interne requises.
  const shelfBooks = releases.filter((b) => b.cover && b.edition).slice(0, SPINES.length);
  // Jauge 2026 TOUJOURS visible (point le plus urgent du site) : avant
  // l'ouverture des dons (pas de clé Stripe → `null`), ou juste après le
  // lancement (0 collecté), la jauge affiche honnêtement une campagne à 0
  // plutôt que de disparaître.
  const liveCampaign = campaign2026 ?? deriveCampaign2026({ collected: 0, contributors: 0 });

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      {/* Colonne principale (jauge, corps de texte, CTA final) — le rail des
          contreparties vit en frère de DOM, sur la droite de la page entière. */}
      <div className="min-w-0">
      {/* La collecte en direct OUVRE la page — jauge 2026 vivante + objectif.
          Pas de séparation horizontale sous la jauge (retour client
          2026-07-24) : elle enchaîne directement sur le corps. N'affiche que
          ce qu'une campagne en cours peut honnêtement montrer (collecté net +
          contributeurs). Fenêtre de fraîcheur ~1–3 min, voir `src/app/CLAUDE.md`. */}
      <section className="bg-paper">
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="flex flex-col gap-[2px] bg-ink p-[2px] lg:flex-row">
              <div className="flex-1 bg-paper p-6 sm:p-8">
                {liveCampaign.collected > 0 ? (
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-relaxed text-ink/70">
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
                  <p className="max-w-md text-[15px] leading-relaxed text-ink/70">
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
                {/* CTA de la jauge (retour client 2026-07-24) : renvoie vers
                    la liste des contreparties, le paiement se joue là-bas. */}
                <Button
                  href="#paliers"
                  variant="invert"
                  aria-label="Contribuer — voir les contreparties"
                  className="mt-5 self-start px-6 py-3 text-sm font-extrabold tracking-[.03em]"
                >
                  Contribuer
                </Button>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Corps de texte — ouvert par le slot vidéo, puis l'ask 2026, le
          récit et les objectifs. Les contreparties n'y sont plus : elles
          vivent dans le rail `#paliers`, à droite de la page entière. */}
      <section className="border-b-2 border-ink bg-paper">
        <Container className="py-16 sm:py-20">
            <div className="flex flex-col gap-14">
              {/* Vidéo de présentation — OUVRE le corps de texte ; tant
                  qu'aucune vidéo n'est livrée, un placeholder au même format
                  tient la place (le bloc ne disparaît jamais). */}
              <Reveal>
                {CAMPAIGN_VIDEO_URL ? (
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
                ) : (
                  <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 border-2 border-ink bg-ink text-paper">
                    <span
                      aria-hidden="true"
                      className="flex h-16 w-16 items-center justify-center border-2 border-paper pl-1 font-sans text-2xl"
                    >
                      ▶
                    </span>
                    <p className="font-sans text-xs font-extrabold uppercase tracking-[.22em] text-paper/70">
                      La vidéo de la souscription — bientôt
                    </p>
                  </div>
                )}
              </Reveal>

              {/* L'ask 2026 — même traitement typographique que l'ancien h1
                  (précédent acté sur cette page) : Effra, italique, gras.
                  Le formulaire montant libre n'est plus ici (il clôt la liste
                  des contreparties), seule l'ancre y mène.
                  TODO(contenu) : le docx s'intitule « Slogans » (pluriel)
                  mais n'en livre qu'un — d'autres variantes pourraient
                  arriver. */}
              {/* Ni ce bloc ni l'étagère qu'il contient ne doivent jamais être
                  enveloppés dans <Reveal> : son `transform` (l'animation
                  d'apparition) crée un containing block qui casse le pop-out
                  3D des dos (position/transform absolus calés sur ce bloc).
                  Pour la même raison, aucun `overflow-hidden` ne doit jamais
                  être posé ici, sur la `Container` ou sur la `section` : ça
                  clipperait le livre déplié, qui déborde largement du bloc. */}
              <div className="bg-ink p-7 text-paper sm:p-9">
                <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-paper sm:text-5xl">
                  100 ans d&apos;édition marxiste : <span className="text-pop-yellow">aidez-nous à poursuivre l&apos;histoire.</span>
                </h1>
                {/* Chemin mobile uniquement : en lg+, le rail sticky des
                    contreparties est déjà visible, l'ancre est redondante. */}
                <a
                  href="#paliers"
                  className={`mt-8 inline-block font-sans text-xs font-bold uppercase tracking-[.04em] text-paper/60 underline decoration-1 underline-offset-2 transition-colors motion-reduce:transition-none hover:text-paper lg:hidden ${FOCUS_RING_DARK}`}
                >
                  Voir les contreparties ↓
                </a>

                <div className="mt-14" role="group" aria-label="Dernières parutions">
                  <HeroShelf books={shelfBooks} />
                </div>
                <MobileShelf books={shelfBooks} />
              </div>

              {/* Récit — mise en forme par registre (texte du docx VERBATIM,
                  seule la composition varie) : chaque section porte un accent
                  de marque selon son contenu — crise = brick (le langage
                  d'alerte du site, cf. panier), bataille politique = navy,
                  héritage centenaire = ocher (`text-ocher-text`, la variante
                  lisible sur paper), appel = bottle. Les phrases-slogans du
                  docx passent en display Effra black italic ; le descriptif
                  reste en corps 15px/ink-70. Jamais de palette pop ici (R2). */}

              {/* Section 1 — la crise : « danger maximal » crié en brick,
                  le montant perdu scalé dans la phrase, la chute (« coup
                  fatal ») en punchline bordée. */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  Édition indépendante et critique :{" "}
                  <span className="uppercase tracking-[.02em] text-brick">danger maximal</span>
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p>
                    En cette fin d&apos;été 2026, l&apos;édition de critique sociale fait
                    face à une des pires crises de son histoire. Des centaines de
                    maisons indépendantes sont menacées par la faillite de leur
                    distributeur Makassar qui disparaît avec des dettes importantes.
                  </p>
                  <p>
                    Pour Les éditions sociales et La Dispute, c&apos;est plus de{" "}
                    <strong className="whitespace-nowrap font-sans text-[1.45em] font-black italic leading-none text-brick">
                      130&nbsp;000&nbsp;€
                    </strong>{" "}
                    de ventes en librairie que nous ne toucherons jamais
                    pour des livres dont nous avons pourtant payé des frais
                    d&apos;impression et de maquette, ainsi que des avances de droits
                    d&apos;auteur.
                  </p>
                  <p className="border-l-4 border-brick pl-4 font-sans text-xl font-black italic leading-tight text-ink sm:text-2xl">
                    Pour nos maisons, c&apos;est le genre de coup qui peut être fatal.
                  </p>
                </div>
              </Reveal>

              {/* Section 2 — la bataille matérielle : le titre EST un slogan
                  (« guerre matérielle » souligné navy), le 90 % des groupes
                  scalé dans la phrase, la chute — « un devoir politique » —
                  surlignée au marqueur navy inversé. */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  La guerre culturelle est aussi une{" "}
                  <span className="underline decoration-navy decoration-4 underline-offset-4">
                    guerre matérielle
                  </span>
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p>
                    La faillite de Makassar est le résultat d&apos;un marché de
                    l&apos;édition où les grands groupes – Hachette, Editis,
                    Média-Participations, Madrigall – détiennent à eux seuls près de{" "}
                    <strong className="whitespace-nowrap font-sans text-[1.45em] font-black italic leading-none text-navy">
                      90&nbsp;%
                    </strong>{" "}
                    de la production éditoriale et de la distribution. Ces
                    grands groupes font la course aux profits et imposent leur loi à
                    tous, avec des conséquences néfastes pour l&apos;ensemble des
                    acteurs indépendants mais aussi des lecteurices.
                  </p>
                  <p>
                    C&apos;est parce que ces groupes existent que leurs propriétaires
                    peuvent se permettre de les utiliser pour mener leurs guerres
                    idéologiques, comme on l&apos;a vu récemment avec Vincent Bolloré.
                  </p>
                  <p>
                    Face à eux, nous devons aller à la racine en exigeant{" "}
                    <strong className="font-semibold text-ink">
                      la fin de la propriété privée des moyens de production
                      culturelle et des infrastructures de distribution
                    </strong>
                    .
                  </p>
                  <p className="font-sans text-xl font-black italic leading-snug text-ink sm:text-2xl">
                    Et, parce que la bataille des idées est aussi une guerre
                    matérielle, soutenir les éditeurs indépendants est{" "}
                    {/* `whitespace-nowrap` : un marqueur coupé en fin de ligne
                        chevaucherait la ligne du dessus (leading serré des
                        displays) — le marqueur passe à la ligne entier. */}
                    <span className="whitespace-nowrap bg-navy px-2 text-paper">
                      un devoir politique
                    </span>
                    .
                  </p>
                </div>
              </Reveal>

              {/* Section 3 — les maisons, cent ans : le « 100 ans » géant et
                  légèrement penché (énergie affiche/sticker de la campagne),
                  l'anaphore « Cent ans de… » composée en litanie bordée
                  ocher ; le reste (chantiers, équipe) demeure descriptif. */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink">
                  Les éditions sociales et La Dispute
                </h2>
                <div className="mt-4 max-w-[70ch] space-y-4 text-[15px] leading-relaxed text-ink/70">
                  <p className="font-sans text-xl font-bold leading-snug text-ink">
                    En 2027, nos maisons fêteront leurs{" "}
                    <span className="my-1 inline-block -rotate-2 whitespace-nowrap font-black italic text-5xl leading-[0.9] text-ocher-text sm:text-6xl">
                      100 ans
                    </span>{" "}
                    d&apos;existence.
                  </p>
                  <p className="border-l-4 border-ocher pl-4 font-sans text-lg font-bold leading-snug text-ink">
                    Cent ans de traductions de Marx et de livres marxistes et de
                    formation militante.
                  </p>
                  <p className="border-l-4 border-ocher pl-4 font-sans text-lg font-bold leading-snug text-ink">
                    Cent ans de publications exigeantes, pour éclairer les
                    transformations du capitalisme, des classes sociales, mener la
                    critique féministe et faire vivre le débat à gauche.
                  </p>
                  <p>
                    Récemment, nous avons ouvert de nouveaux chantiers prometteurs
                    pour nos maisons en arrivant chez un nouveau
                    diffuseur-distributeur, BLDD ; en lançant de nouvelles
                    collections ; en partant à la rencontre des libraires partout
                    dans le pays.
                  </p>
                  <p>
                    Mais notre équipe s&apos;agrandit aussi :{" "}
                    <strong className="font-semibold text-ink">
                      Nicolas Vieillescazes
                    </strong>
                    , ancien directeur éditorial d&apos;Amsterdam, nous rejoint pour
                    renforcer les éditions sociales et La Dispute.
                  </p>
                  <p>
                    Tous ces choix portent leurs fruits mais la faillite de Makassar
                    nous frappe{" "}
                    <strong className="font-semibold text-ink">
                      au moment où nous construisons l&apos;avenir
                    </strong>
                    .
                  </p>
                </div>
              </Reveal>

              {/* Section 4 — l'appel : adresse directe, donc tout en display —
                  titre scalé avec « de vous » au marqueur bottle, paragraphe
                  unique agrandi (c'est l'ask du récit, pas un descriptif). */}
              <Reveal>
                <h2 className="font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
                  Nous avons besoin{" "}
                  <span className="whitespace-nowrap bg-bottle px-2 text-paper">
                    de vous
                  </span>
                </h2>
                <div className="mt-4 max-w-[62ch]">
                  <p className="font-sans text-lg font-medium leading-relaxed text-ink sm:text-xl">
                    Nous voulons que notre histoire se poursuive ; c&apos;est pourquoi
                    nous faisons appel à vous. En faisant un don, vous nous aiderez
                    à surmonter cette crise, à{" "}
                    <strong className="font-bold underline decoration-bottle decoration-4 underline-offset-4">
                      préserver notre indépendance
                    </strong>{" "}
                    et à poursuivre un travail éditorial engagé, exigeant et
                    indispensable.
                  </p>
                </div>
              </Reveal>

              {/* Objectifs de la jauge — pas de titre de section au-dessus,
                  la jauge d'ouverture porte déjà « Objectif » : les cellules
                  parlent d'elles-mêmes. */}
              <FramedGrid className="grid-cols-1 sm:grid-cols-3">
                {OBJECTIFS.map((o) => (
                  <Reveal key={o.titre} className="h-full">
                    <div
                      className={`flex h-full flex-col ${o.sommet ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                    >
                      <div aria-hidden="true" className={`h-2 ${o.accent}`} />
                      <div className="flex flex-1 flex-col gap-2 p-6">
                        <span className="font-sans text-3xl font-black italic">
                          {o.montant}
                        </span>
                        <span className="font-sans text-base font-extrabold uppercase tracking-[.02em]">
                          {o.titre}
                        </span>
                        <p
                          className={`mt-1 text-sm leading-relaxed ${o.sommet ? "text-paper/70" : "text-ink/70"}`}
                        >
                          {o.desc}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </FramedGrid>
            </div>

        </Container>
      </section>

      {/* CTA final — phrase de clôture du docx, verbatim. Le montant libre
          vivant désormais en clôture du rail, le CTA y renvoie simplement. */}
      <section className="bg-ink text-paper">
        <div className="grid grid-cols-4" aria-hidden="true">
          {POP_BG.map((c) => (
            <div key={c} className={`h-1.5 ${c}`} />
          ))}
        </div>
        <Container className="flex flex-col items-start gap-6 py-16 sm:py-20 md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-2xl font-sans text-3xl font-black italic leading-[1.05] sm:text-4xl">
            Vous nous permettrez de continuer à publier les livres qui
            imaginent la fin du capitalisme plutôt que la fin du monde.
          </h2>
          <Button
            href="#paliers"
            variant="invert"
            aria-label="Contribuer — voir les contreparties"
            className="shrink-0 px-7 py-3.5 text-sm font-extrabold tracking-[.03em]"
          >
            Contribuer
          </Button>
        </Container>
      </section>
      </div>

      {/* Rail contreparties — module autonome sur la droite de la PAGE
          ENTIÈRE (retour client 2026-07-24), plus une colonne du corps de
          texte : ancré au défilement, borné à la hauteur du viewport sous le
          header, avec sa propre barre de scroll. Les 9 cartes sont
          uniformes ; la carte « montant libre » clôt la liste. Sur mobile,
          le rail suit toute la colonne principale (l'ancre `#paliers` y
          mène). */}
      <aside
        id="paliers"
        aria-label="Contreparties"
        className="border-t-2 border-ink bg-paper lg:sticky lg:top-24 lg:scroll-mt-24 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:border-l-2 lg:border-t-0"
      >
        <div className="p-4 sm:p-6">
              <FramedGrid className="grid-cols-1">
                {content.contreparties.map((p, i) => {
                  // Paliers de don : les 4 accents de marque, jamais le cycle pop (R2/R3).
                  const accentBg = BG[ACCENTS[i % 4]];
                  // Un palier ajouté à DONATION_TIERS sans visuel dans
                  // TIER_IMAGES rend une carte sans image, jamais un crash.
                  const img = TIER_IMAGES[p.tier.id];
                  const compact = COMPACT_TIERS.has(p.tier.id);
                  return (
                    <Reveal key={p.tier.id} className="h-full">
                      <div className="relative flex h-full flex-col bg-paper">
                        <div aria-hidden="true" className={`h-2 ${accentBg}`} />
                        {/* Montage produit sur fond blanc pur — `mix-blend-multiply`
                            fond le blanc dans le `bg-paper` (blanc cassé) du site,
                            les ombres portées restent correctes. Décoratif : la
                            liste textuelle des items porte l'information (alt vide). */}
                        {img && !compact && (
                          <Image
                            src={img}
                            alt=""
                            sizes="(min-width: 1024px) 380px, 100vw"
                            className="block h-auto w-full mix-blend-multiply"
                          />
                        )}
                        <div className="flex flex-1 flex-col p-6">
                          {compact ? (
                            /* Variante compacte : l'illustration réduite se
                               loge à droite du montant/intitulé (léger débord
                               vers le cadre, `-mr-2`), pas de bandeau. */
                            <div className="flex items-center justify-between gap-3">
                              <h3>
                                <span className="block font-sans text-4xl font-black italic text-ink">
                                  {p.tier.amount}&nbsp;€
                                </span>
                                <span className="mt-1 block font-sans text-sm font-extrabold uppercase tracking-[.02em] text-ink">
                                  {p.tier.title}
                                </span>
                              </h3>
                              {img && (
                                <Image
                                  src={img}
                                  alt=""
                                  sizes="(min-width: 1024px) 140px, 35vw"
                                  className="-mr-2 block h-auto w-[35%] shrink-0 mix-blend-multiply"
                                />
                              )}
                            </div>
                          ) : (
                            <h3>
                              <span className="block font-sans text-4xl font-black italic text-ink">
                                {p.tier.amount}&nbsp;€
                              </span>
                              <span className="mt-1 block font-sans text-sm font-extrabold uppercase tracking-[.02em] text-ink">
                                {p.tier.title}
                              </span>
                            </h3>
                          )}
                          {/* Lot en bandes pleine largeur (maquette PDF client) :
                              cadre ink 2px, une bande par ligne, séparateurs
                              porteurs d'un « + » (le lot s'additionne). Une
                              ligne `alternative` (règle « ou » de
                              `site-content-core`) s'accroche à la précédente
                              SANS séparateur : un « ou » centré dans l'écart
                              entre les deux lignes — un choix, pas un ajout. */}
                          <ul className="mt-4 flex-1 self-start w-full border-2 border-ink">
                            {p.items.map((item, j) => (
                              <li key={item.texte}>
                                {j > 0 &&
                                  (item.alternative ? (
                                    <p className="-my-1.5 text-center font-sans text-sm font-medium italic leading-none text-ink">
                                      ou
                                    </p>
                                  ) : (
                                    <div aria-hidden="true" className="relative h-[2px] bg-ink">
                                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-paper px-1.5 font-sans text-sm font-black leading-none text-ink">
                                        +
                                      </span>
                                    </div>
                                  ))}
                                <p className="px-3 py-2.5 text-center font-sans text-sm font-bold leading-snug text-ink">
                                  {item.texte}
                                </p>
                              </li>
                            ))}
                          </ul>
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
                                className={`mt-3 min-h-11 inline-flex items-center justify-center gap-2 border-2 border-ink bg-ink px-4 py-2.5 font-sans text-sm font-bold uppercase tracking-[.03em] text-paper transition-colors motion-reduce:transition-none hover:bg-paper hover:text-ink ${FOCUS_RING_DARK}`}
                              >
                                Contribuer
                              </SubmitButton>
                            </form>
                          ) : (
                            <ClosedCta className="mt-3" />
                          )}
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
                {/* Carte de clôture — montant libre (retour client
                    2026-07-24) : le formulaire à montant personnalisé vit
                    tout en bas de la liste, après les 9 paliers, et
                    poursuit le cycle des 4 accents de marque. */}
                <Reveal className="h-full">
                  <div className="flex h-full flex-col bg-paper">
                    <div
                      aria-hidden="true"
                      className={`h-2 ${BG[ACCENTS[content.contreparties.length % 4]]}`}
                    />
                    <div className="flex flex-1 flex-col p-6">
                      <h3>
                        <span className="block font-sans text-3xl font-black italic text-ink">
                          Montant libre
                        </span>
                        <span className="mt-1 block font-sans text-sm font-extrabold uppercase tracking-[.02em] text-ink">
                          Contribuez à la hauteur de votre choix
                        </span>
                      </h3>
                      <FreeAmountForm enabled={enabled} />
                    </div>
                  </div>
                </Reveal>
              </FramedGrid>
        </div>
      </aside>
    </div>
  );
}
