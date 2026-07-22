import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Reveal } from "@/components/reveal";
import { Cover } from "@/lib/cover";
import { splitDateFr } from "@/lib/format";
import { getRencontres, type Rencontre } from "@/lib/rencontres";

export const metadata: Metadata = {
  title: "Rencontres",
  description: "Rencontres, débats et présentations autour de nos livres.",
  alternates: { canonical: "/rencontres" },
};

// Donnée Payload/Postgres, comme le reste des pages branchées back-office
// (`(site)/page.tsx`, fiche livre) — même fenêtre ISR, purgée à l'édition par
// `revalidateRencontresAfterChange`/`AfterDelete` (`src/payload/hooks/revalidate.ts`).
export const revalidate = 3600;

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
  return new URL(url, process.env.NEXT_PUBLIC_SITE_URL ?? "https://editionssociales.fr").toString();
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

      <section className="border-b-2 border-ink bg-paper">
        <Container className="py-16 sm:py-20">
          <Reveal>
            {/* Pas de surtitre au-dessus du titre (R6) — le marqueur pop-yellow
                vit EN LIGNE avec le h2, jamais en surtitre distinct. */}
            <h2 className="flex items-center gap-3 font-sans text-3xl font-black italic leading-[0.98] text-ink sm:text-4xl">
              <span className="inline-block h-3 w-3 flex-none bg-pop-yellow" aria-hidden="true" />
              À venir
            </h2>
          </Reveal>

          {hasAVenir ? (
            <div className="mt-10 flex flex-col gap-8">
              {aVenir.map((r, i) => (
                <Reveal key={r.id} delay={i * 100}>
                  <RencontreRow rencontre={r} />
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal delay={80}>
              <div className="mt-10 border-2 border-dashed border-ink bg-paper-2 p-8 text-center">
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
        <section className="bg-paper">
          <Container className="py-16 sm:py-20">
            <Reveal>
              <h2 className="flex items-center gap-3 font-sans text-2xl font-black italic leading-[0.98] text-ink">
                <span className="inline-block h-3 w-3 flex-none bg-ink/30" aria-hidden="true" />
                Rencontres passées
              </h2>
            </Reveal>
            <div className="mt-8 flex flex-col gap-5">
              {passees.map((r, i) => (
                <Reveal key={r.id} delay={i * 80}>
                  <RencontreRow rencontre={r} compact />
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      )}
    </>
  );
}

/**
 * Une rencontre = une ligne. Layout horizontal desktop (date · image ·
 * contenu), bandeau + empilement vertical en mobile — cf. commentaires
 * inline pour l'ordre DOM (identique aux deux ruptures, seul le CSS change).
 */
function RencontreRow({ rencontre, compact = false }: { rencontre: Rencontre; compact?: boolean }) {
  const { titre, date, heure, lieu, ville, intervenants, description, image, livre } = rencontre;
  const parts = splitDateFr(date);
  const alt = image?.alt ?? titre;
  const imageHeight = compact ? "h-36" : "h-48";
  const titleClass = compact
    ? "font-sans text-lg font-black italic leading-snug text-ink"
    : "font-sans text-xl font-black italic leading-snug text-ink sm:text-2xl";
  const padding = compact ? "p-4 sm:p-5" : "p-6";

  const imageEl = image && (
    <span
      className={`flex ${imageHeight} flex-none items-center justify-center border-b-2 border-dashed border-ink bg-paper-2 p-3 sm:border-b-0 sm:border-r-2`}
    >
      <Cover cover={image} alt={alt} fit="height" sizes="200px" className="max-w-full" />
    </span>
  );

  return (
    <article className="flex flex-col border-2 border-dashed border-ink bg-paper-2 sm:flex-row">
      {/* Bloc date desktop — fond ink, largeur fixe (~7rem). Masqué en
          mobile (le bandeau ci-dessous porte la même info, layout différent). */}
      <div className="hidden w-28 flex-none flex-col items-center justify-center gap-1 border-r-2 border-dashed border-ink bg-ink px-3 py-6 text-center sm:flex">
        {parts && (
          <time
            dateTime={date}
            className="flex flex-col items-center gap-0.5 leading-none"
          >
            <span className="font-sans text-4xl font-black text-pop-yellow">{parts.jour}</span>
            <span className="font-sans text-xs font-extrabold uppercase tracking-[.08em] text-paper">
              {parts.mois}
            </span>
            <span className="font-sans text-[11px] text-paper/70">{parts.annee}</span>
          </time>
        )}
        {heure && (
          <span className="mt-1 font-sans text-[11px] font-bold text-pop-yellow">{heure}</span>
        )}
      </div>

      {/* Bandeau mobile — date + heure à gauche (fond ink), lieu à droite.
          Masqué en desktop (le bloc date ci-dessus prend le relais). */}
      <div className="flex items-stretch border-b-2 border-dashed border-ink sm:hidden">
        <div className="flex flex-col items-center justify-center gap-0.5 bg-ink px-4 py-3">
          {parts && (
            <time dateTime={date} className="font-sans text-base font-black leading-none text-pop-yellow">
              {parts.jour} {parts.mois}
            </time>
          )}
          {heure && (
            <span className="font-sans text-[11px] font-bold text-pop-yellow">{heure}</span>
          )}
        </div>
        <div className="flex flex-1 items-center justify-end border-l-2 border-dashed border-ink px-4 py-3 text-right">
          <span className="font-sans text-xs font-bold uppercase tracking-[.04em] text-muted">
            {lieu}, {ville}
          </span>
        </div>
      </div>

      {/* Colonne image — cliquable vers la fiche livre si un livre est lié.
          Aucune colonne si aucune image (pas de placeholder gris, le contenu
          prend la place). */}
      {imageEl && livre ? (
        <Link href={livreHref(livre)} className="block flex-none">
          {imageEl}
        </Link>
      ) : (
        imageEl
      )}

      <div className={`flex flex-1 flex-col gap-2 ${padding}`}>
        <p className="hidden font-sans text-xs font-bold uppercase tracking-[.04em] text-muted sm:block">
          {lieu}, {ville}
        </p>
        <p className={titleClass}>{titre}</p>
        {intervenants && (
          <p className="font-sans text-xs font-bold uppercase tracking-[.04em] text-muted">
            {intervenants}
          </p>
        )}
        <p className="max-w-prose text-[15px] leading-relaxed text-ink-soft">{description}</p>
        {livre && (
          <Link
            href={livreHref(livre)}
            className="mt-1 inline-block w-fit text-sm font-bold text-ink underline underline-offset-2 hover:text-ink/70"
          >
            Découvrir le livre →
          </Link>
        )}
      </div>
    </article>
  );
}
