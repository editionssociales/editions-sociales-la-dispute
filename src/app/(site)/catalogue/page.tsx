import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { catalogueView } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { CatalogueFallback } from "@/components/catalogue-fallback";
import { Container } from "@/components/container";
import { Pagination } from "@/components/pagination";
import { PageHero } from "@/components/page-hero";
import { parseBookFilters } from "@/lib/parse-filters";
import { catalogueHref } from "@/lib/browse";
import { NAV_BOUTIQUE } from "@/lib/nav";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Le catalogue des Éditions sociales x La Dispute : essais critiques, sciences sociales, philosophie et histoire du mouvement ouvrier.",
  // Sans query string : les vues filtrées/paginées canonicalisent vers la
  // vue de base (E2 du plan).
  alternates: { canonical: "/catalogue" },
};

type SearchParams = Record<string, string | string[] | undefined>;

export const revalidate = 3600; // fenêtre ISR du catalogue (donnée Payload/Postgres)

async function CatalogueBody({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseBookFilters(await searchParams);
  const { books, page, totalPages, total, isUpcoming, facets } = await catalogueView(filters);

  const hrefFor = (p: number) => catalogueHref({ ...filters, page: p });
  // Sortie de l'état « 0 résultat » : repart du catalogue complet (tri
  // conservé), même logique que « Tout effacer » côté filtres.
  const resetHref = catalogueHref({ sort: filters.sort });

  return (
    <Container className="bg-paper py-12 sm:py-16">
      <PageHero
        title={isUpcoming ? "Les livres à paraître" : "Le catalogue par libellés"}
        className="max-w-2xl"
      >
        {/* Le rayon boutique (goodies, manuels…) n'a pas sa place dans cette
            grille de livres — chantier 3 §1 : un lien contextuel évite qu'il
            reste invisible depuis le catalogue. */}
        <p className="mt-3 text-sm text-muted">
          Vous cherchez un objet plutôt qu&apos;un livre&nbsp;?{" "}
          <Link
            href={NAV_BOUTIQUE.href}
            className={`font-bold text-ink underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT_OUTER}`}
          >
            Direction la {NAV_BOUTIQUE.label.toLowerCase()}
          </Link>
          .
        </p>
      </PageHero>

      <div className="mt-6 sm:mt-7">
        <CatalogueFilters
          libelles={facets.libelles}
          authors={facets.authors}
          totalCount={facets.total}
        />
      </div>

      <div className="mt-6 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-[18px]">
        <span className="font-sans text-[13px] font-bold uppercase tracking-[.03em] text-ink">
          {total} {isUpcoming ? "titres à paraître" : "résultats"}
        </span>
      </div>

      <div className="mt-4">
        <BookGrid books={books} resetHref={resetHref} />
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </Container>
  );
}

export default function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<CatalogueFallback />}>
      <CatalogueBody searchParams={searchParams} />
    </Suspense>
  );
}
