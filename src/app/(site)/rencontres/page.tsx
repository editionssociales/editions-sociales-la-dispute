import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/button";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { BookCover, Cover } from "@/lib/cover";
import { splitDateFr } from "@/lib/format";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";
import { getRencontres, type Rencontre } from "@/lib/rencontres";

export const metadata: Metadata = {
  title: "Rencontres",
  description: "Rencontres, débats et présentations autour de nos livres.",
  alternates: { canonical: "/rencontres" },
};

// Donnée Payload/Postgres, comme le reste des pages branchées back-office
// (`(site)/page.tsx`, fiche livre) — même fenêtre ISR 24 h (filet), purgée à
// l'édition par `revalidateRencontresAfterChange`/`AfterDelete`
// (`src/payload/hooks/revalidate.ts`).
export const revalidate = 86400;

/** URL de la fiche d'un livre lié — même règle que `book-card.tsx` (fonds vs boutique-seul). */
function livreHref(livre: NonNullable<Rencontre["livre"]>): string {
  return livre.edition ? `/catalogue/${livre.edition}/${livre.slug}` : `/boutique/${livre.slug}`;
}

type EventJsonLd = {
  "@type": "Event";
  name: string;
  startDate: string;
  location: { "@type": "Place"; name: string; address: string };
  description?: string;
  image?: string;
};

/** URL absolue exigée par schema.org — même repli que la fiche livre (`catalogue/[edition]/[slug]/page.tsx`). */
function absoluteUrl(url: string): string {
  return new URL(url, process.env.NEXT_PUBLIC_SITE_URL ?? "https://ld-es.fr").toString();
}

export default async function RencontresPage() {
  const { aVenir, passees } = await getRencontres();
  const hasAVenir = aVenir.length > 0;
  const hasPassees = passees.length > 0;

  const eventsJsonLd: EventJsonLd[] = aVenir.map((r) => ({
    "@type": "Event",
    name: r.titre,
    startDate: r.date,
    location: { "@type": "Place", name: r.lieu, address: r.ville },
    ...(r.description ? { description: r.description } : {}),
    ...(r.image ? { image: absoluteUrl(r.image.url) } : {}),
  }));
  const jsonLdScript =
    eventsJsonLd.length > 0
      ? JSON.stringify({ "@context": "https://schema.org", "@graph": eventsJsonLd }).replace(
          /</g,
          "\\u003c",
        )
      : null;

  return (
    <>
      {/* Titre visuel retiré (demande client, refonte 2026-07) : le nom
          accessible de la page reste porté par ce h1, masqué visuellement
          (même recette que l'accueil, `(site)/page.tsx`). */}
      <h1 className="sr-only">Agenda</h1>

      {jsonLdScript && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript }} />
      )}

      <section className="bg-paper pb-14 pt-6 sm:pt-8 md:pb-24">
        <Container>
          {/* Retour client 2026-07-23 : seuls les événements « grande
              affiche » (`pleinCadre`, ex. braderie) gardent la carte héros
              pleine largeur, en tête ; les autres s'affichent en grille 2-3
              colonnes au même format que les rencontres passées (cadre
              pointillé conservé — c'est lui qui distingue l'à-venir). */}
          {hasAVenir ? (
            <div className="flex flex-col gap-10">
              {aVenir
                .filter((r) => r.pleinCadre)
                .map((r, i) => (
                  <Reveal key={r.id} delay={i * 100}>
                    {/* Issue #85 : seule la toute première carte héros (haut de
                        page) est un candidat LCP réel — précharger les
                        suivantes gaspillerait la bande passante prioritaire. */}
                    <HeroCard rencontre={r} preload={i === 0} />
                  </Reveal>
                ))}
              {aVenir.some((r) => !r.pleinCadre) && (
                <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
                  {aVenir
                    .filter((r) => !r.pleinCadre)
                    .map((r, i) => (
                      <Reveal key={r.id} delay={i * 80}>
                        <PastCard rencontre={r} dashed />
                      </Reveal>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <Reveal delay={80}>
              <div className="border-2 border-dashed border-ink bg-paper-2 p-8 text-center">
                <p className="font-sans text-lg font-black italic text-ink">
                  Prochaines dates en préparation
                </p>
                <p className="mt-2 text-[15px] text-ink-soft">
                  Aucune rencontre n&apos;est programmée pour le moment — revenez bientôt, ou
                  suivez l&apos;actualité des deux maisons sur le catalogue.
                </p>
              </div>
            </Reveal>
          )}
        </Container>
      </section>

      {hasPassees && (
        <section className="border-t-2 border-dashed border-line bg-paper py-14 md:py-24">
          <Container>
            <Reveal>
              <h2 className="flex items-center gap-3 font-sans text-2xl font-black italic leading-[0.98] text-ink">
                <span className="inline-block h-3 w-3 flex-none bg-ink/30" aria-hidden="true" />
                Rencontres passées
              </h2>
            </Reveal>
            <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-2">
              {passees.map((r, i) => (
                <Reveal key={r.id} delay={i * 80}>
                  <PastCard rencontre={r} />
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* CTA final — copy adaptée : ne pas prétendre « en attendant les
          premières dates » quand des dates réelles sont affichées au-dessus. */}
      <section className="bg-ink text-paper">
        <Container className="flex flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-sans text-2xl font-black italic sm:text-3xl">
              {hasAVenir || hasPassees
                ? "Retrouvez-nous en librairie"
                : "En attendant les premières dates"}
            </h2>
            <p className="mt-2 text-paper/75">
              Parcourez le catalogue des deux maisons, ou soutenez la
              souscription de lancement.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button
              href="/catalogue"
              variant="outline"
              className="px-7 py-3.5 text-sm tracking-[.04em]"
            >
              Découvrir le catalogue
            </Button>
            <Button
              href="/souscription"
              variant="outline"
              className="px-7 py-3.5 text-sm tracking-[.04em]"
            >
              Soutenir la souscription
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

/**
 * Plaque date — débord assumé (`-left-4 -top-4`, 16px) sur le cadre de la
 * carte porteuse : PAS de `overflow-hidden` sur les ancêtres (cadre pointillé
 * cassé par la plaque, effet recherché de la maquette « plein cadre »).
 * `z-10` explicite : départage la superposition avec la zone visuelle,
 * elle-même `relative` (nécessaire à l'image `fill`) — deux voisins positionnés
 * `z-index:auto` s'ordonneraient sinon par ordre DOM (la zone visuelle, placée
 * après en JSX, passerait au-dessus).
 */
function DatePlaque({ date, heure, small = false }: { date: string; heure?: string; small?: boolean }) {
  const parts = splitDateFr(date);
  if (!parts) return null;
  return (
    <div
      className={`absolute -left-4 -top-4 z-10 flex flex-col items-start border-2 border-ink bg-ink text-paper ${
        small ? "px-4 py-2.5" : "px-5 py-3.5"
      }`}
    >
      <time dateTime={date} className="flex flex-col items-start leading-none">
        <span
          className={`font-sans font-black italic leading-[0.9] text-pop-yellow ${
            small ? "text-[40px]" : "text-[56px]"
          }`}
        >
          {parts.jour}
        </span>
        <span className="mt-1.5 font-sans text-[13px] font-bold uppercase tracking-[.06em] text-paper">
          {parts.mois} {parts.annee}
        </span>
      </time>
      {heure && (
        <span className="mt-1.5 font-sans text-xs font-bold tracking-[.03em] text-pop-yellow">
          {heure}
        </span>
      )}
    </div>
  );
}

/**
 * Zone visuelle (gauche du héros / haut d'une carte passée) — règle « photo
 * vs couverture » (décision design, chantier plein cadre 2026-07) : une image
 * PAYSAGE (`width > height`) est une photo d'événement, recadrable en plein
 * cadre (`next/image` `fill` + `object-cover`, dimensions connues à l'upload) ;
 * une image PORTRAIT (ou carrée) est une couverture de livre ou un visuel
 * vertical, JAMAIS recadrée (`Cover`, `fit="height"`, même contrat que
 * partout ailleurs sur le site). Sans image : repli typographique du titre du
 * livre lié via `BookCover` (cover `null`) ; sans livre non plus, `null` — pas
 * de zone visuelle du tout (l'appelant retombe alors sur une carte à une
 * seule colonne de contenu).
 */
function renderVisualZone(
  rencontre: Rencontre,
  {
    zoneClassName,
    coverHeightClassName,
    imageSizes,
    preload,
  }: {
    zoneClassName: string;
    coverHeightClassName: string;
    imageSizes: string;
    /** Issue #85 : candidat LCP (photo de l'événement à la une) — `false` par
     *  défaut, à poser UNIQUEMENT sur la première carte héros de la page. */
    preload?: boolean;
  },
) {
  const { image, titre, livre } = rencontre;
  const alt = image?.alt ?? livre?.titre ?? titre;

  // Chaque branche re-teste sa propre variable (`image`/`livre`) plutôt que de
  // dériver l'absence des deux avant coup : garde le rétrécissement de type
  // simple, sans assertion non-null.
  let media: ReactNode = null;
  if (image && image.width > image.height) {
    media = (
      <Image
        src={image.url}
        alt={alt}
        fill
        sizes={imageSizes}
        preload={preload}
        className="object-cover"
      />
    );
  } else if (image) {
    media = (
      <span className={`flex ${coverHeightClassName} items-center justify-center`}>
        <Cover cover={image} alt={alt} fit="height" sizes="320px" preload={preload} className="max-w-full" />
      </span>
    );
  } else if (livre) {
    media = (
      <span className={`flex ${coverHeightClassName} w-full items-center justify-center`}>
        <BookCover
          cover={null}
          title={livre.titre}
          alt={alt}
          fit="height"
          sizes="320px"
          preload={preload}
          fallbackClassName="px-8 py-6"
        />
      </span>
    );
  }
  if (!media) return null;

  const content = livre ? (
    <Link
      href={livreHref(livre)}
      className={`group flex h-full w-full items-center justify-center ${FOCUS_RING_LIGHT_OUTER}`}
    >
      <span className="flex h-full w-full items-center justify-center transition-opacity duration-300 group-hover:opacity-90 motion-reduce:transition-none">
        {media}
      </span>
    </Link>
  ) : (
    media
  );

  return (
    <div className={`relative flex items-center justify-center bg-paper-2 ${zoneClassName}`}>
      {content}
    </div>
  );
}

/** Méta « lieu · ville », même recette dans le héros et les cartes passées. */
function MetaLine({ lieu, ville }: { lieu: string; ville: string }) {
  return (
    <p className="font-sans text-[13px] font-bold uppercase tracking-[.06em] text-muted">
      {lieu}
      <span className="mx-2 text-line" aria-hidden="true">
        ·
      </span>
      {ville}
    </p>
  );
}

/** Lien « Découvrir le livre » — soulignement épais jaune, bascule ink au survol (maquette). */
function DecouvrirLeLivre({ livre }: { livre: NonNullable<Rencontre["livre"]> }) {
  return (
    <Link
      href={livreHref(livre)}
      className={`mt-1 inline-flex w-fit items-center gap-2 border-b-2 border-pop-yellow pb-1 font-sans text-sm font-bold uppercase tracking-[.05em] text-ink hover:border-ink ${FOCUS_RING_LIGHT_OUTER}`}
    >
      Découvrir le livre →
    </Link>
  );
}

/**
 * Carte héros — une rencontre à venir, pleine largeur. Cadre pointillé
 * (`border-dashed`, PAS d'`overflow-hidden` : la plaque date déborde à
 * dessein). Deux moitiés dès `md:` (zone visuelle / contenu) ; sans zone
 * visuelle (aucune image ni livre lié), la carte retombe sur une seule
 * colonne — la plaque reste alors en butée du contenu, d'où le supplément de
 * marge haute (`pt-24`) pour ne jamais chevaucher le texte (elle déborderait
 * sinon sur la méta-ligne, la zone visuelle absorbant normalement ce débord).
 */
function HeroCard({ rencontre, preload }: { rencontre: Rencontre; preload?: boolean }) {
  const { titre, heure, date, lieu, ville, intervenants, description, livre } = rencontre;
  const visual = renderVisualZone(rencontre, {
    zoneClassName:
      "h-72 border-b-2 border-dashed border-ink md:h-auto md:min-h-[420px] md:border-b-0 md:border-r-2",
    // Mobile : la zone fait `h-72` (288px) — la couverture doit rester en
    // dessous (240px), sinon elle déborderait du cadre (pas d'overflow-hidden,
    // débord de plaque oblige).
    coverHeightClassName: "h-60 md:h-[360px]",
    imageSizes: "(min-width: 768px) 50vw, 100vw",
    preload,
  });

  return (
    <article
      className={`relative border-2 border-dashed border-ink bg-paper ${visual ? "grid md:grid-cols-2" : ""}`}
    >
      <DatePlaque date={date} heure={heure} />
      {visual}
      <div className={`flex flex-col justify-center gap-5 p-10 md:p-14 ${visual ? "" : "pt-24"}`}>
        <MetaLine lieu={lieu} ville={ville} />
        <h3 className="font-sans text-[clamp(32px,3vw,44px)] font-black italic leading-[1.08] text-ink">
          {titre}
        </h3>
        {intervenants && (
          <p className="font-sans text-xs font-bold uppercase tracking-[.05em] text-muted">
            {intervenants}
          </p>
        )}
        <p className="max-w-[44ch] text-[17px] leading-[1.6] text-ink-soft">{description}</p>
        {livre && <DecouvrirLeLivre livre={livre} />}
      </div>
    </article>
  );
}

/**
 * Carte de grille — verticale (zone visuelle en haut, corps en bas, à tout
 * breakpoint — seule la grille qui la contient devient 2-3 colonnes dès
 * `md:`). Historiquement réservée aux rencontres passées ; depuis le retour
 * client 2026-07-23 elle sert aussi aux à-venir sans « grande affiche » —
 * `dashed` garde alors la sémantique de cadre du site : pointillé = à venir,
 * PLEIN = acquis.
 */
function PastCard({ rencontre, dashed = false }: { rencontre: Rencontre; dashed?: boolean }) {
  const { titre, heure, date, lieu, ville, intervenants, description, livre } = rencontre;
  const frame = dashed ? "border-dashed" : "";
  const visual = renderVisualZone(rencontre, {
    zoneClassName: `h-[300px] border-b-2 border-ink ${frame}`,
    coverHeightClassName: "h-[260px]",
    imageSizes: "(min-width: 768px) 50vw, 100vw",
  });

  return (
    <article className={`relative flex flex-col border-2 border-ink bg-paper ${frame}`}>
      <DatePlaque date={date} heure={heure} small />
      {visual}
      <div className={`flex flex-1 flex-col gap-4 p-9 ${visual ? "" : "pt-20"}`}>
        <MetaLine lieu={lieu} ville={ville} />
        <h3 className="font-sans text-[26px] font-black italic leading-[1.15] text-ink">{titre}</h3>
        {intervenants && (
          <p className="font-sans text-xs font-bold uppercase tracking-[.05em] text-muted">
            {intervenants}
          </p>
        )}
        <p className="text-[15px] leading-relaxed text-ink-soft">{description}</p>
        {livre && <DecouvrirLeLivre livre={livre} />}
      </div>
    </article>
  );
}
