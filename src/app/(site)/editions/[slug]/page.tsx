import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { BookGrid } from "@/components/book-grid";
import { Button } from "@/components/button";
import { PageHero } from "@/components/page-hero";
import { ACCENT_BG } from "@/lib/accents";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import { countBooks, getBooks } from "@/lib/catalogue";
import { FOCUS_RING_LIGHT } from "@/lib/ui";

export const revalidate = 3600; // fenêtre ISR du catalogue (donnée Payload/Postgres)

export function generateStaticParams() {
  return [{ slug: "editions-sociales" }, { slug: "la-dispute" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isEditionSlug(slug)) return {};
  return {
    // Titre absolu : évite « Les Éditions sociales — Les Éditions sociales ×
    // La Dispute » (redondance quand la maison porte le nom du site).
    title: { absolute: `${EDITIONS[slug].name} — maison d'édition` },
    description: EDITIONS[slug].description,
    alternates: { canonical: `/editions/${slug}` },
  };
}

export default async function EditionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isEditionSlug(slug)) notFound();
  const info = EDITIONS[slug];
  // Une seule lecture catalogue (cache) : total + 8 récentes, sans matérialiser
  // toute la grille dans le HTML.
  const [total, recent] = await Promise.all([
    countBooks(slug),
    getBooks({ edition: slug, sort: "recent" }),
  ]);
  const books = recent.slice(0, 8);

  return (
    <>
      {/* Héro plein cadre, dans l'accent de la maison */}
      <section className={`border-b-2 border-ink ${ACCENT_BG[info.accent]}`}>
        <Container className="py-16 sm:py-20">
          <PageHero tone="cover" title={info.name} className="max-w-4xl">
            <p className="mt-4 max-w-2xl font-sans text-lg font-bold leading-snug text-paper/90">
              {info.tagline}
            </p>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-paper/80">
              {info.description}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <p className="flex items-baseline gap-2 border-2 border-paper px-4 py-2.5">
                <span className="font-sans text-2xl font-black italic text-paper">
                  {total}
                </span>
                <span className="font-sans text-xs font-bold uppercase tracking-[.04em] text-paper/80">
                  titres au catalogue
                </span>
              </p>
              <Button
                href={info.legacyUrl}
                target="_blank"
                rel="noreferrer"
                variant="outline"
                className="gap-1 px-4 py-2.5 text-xs tracking-[.04em]"
              >
                Site historique
                <span aria-hidden="true">&nbsp;↗</span>
              </Button>
            </div>
          </PageHero>
        </Container>
      </section>

      {/* Parutions récentes — liste utilitaire, sans effet d'apparition */}
      <Container className="bg-paper py-12 sm:py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4 sm:mb-8">
          <div>
            <h2 className="font-sans text-2xl font-black italic uppercase leading-[0.98] text-ink sm:text-3xl">
              Parutions récentes
            </h2>
          </div>
          <Link
            href={`/catalogue/${slug}`}
            className={`font-sans text-sm font-bold uppercase tracking-[.03em] text-ink hover:underline ${FOCUS_RING_LIGHT}`}
          >
            Tout le catalogue →
          </Link>
        </div>
        <BookGrid books={books} />
      </Container>

      {/* Bandeau final, discret, vers le catalogue de la maison */}
      <section className="border-t-2 border-ink bg-paper">
        <Container className="flex flex-col items-start gap-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-[15px] leading-relaxed text-ink/70">
            Le fonds {info.shortName} compte {total} titres — tous réunis dans
            le catalogue de la maison.
          </p>
          <Button
            href={`/catalogue/${slug}`}
            className="shrink-0 px-6 py-3.5 text-sm tracking-[.03em]"
          >
            Parcourir tout le fonds
          </Button>
        </Container>
      </section>
    </>
  );
}
