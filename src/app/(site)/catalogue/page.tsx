import type { Metadata } from "next";
import { Suspense } from "react";
import { catalogueView } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { CatalogueFallback } from "@/components/catalogue-fallback";
import { Container } from "@/components/container";
import { Pagination } from "@/components/pagination";
import { Breadcrumb } from "@/components/breadcrumb";
import { parseBookFilters } from "@/lib/parse-filters";
import { catalogueHref } from "@/lib/browse";

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

  return (
    <Container className="bg-white py-12">
      <Breadcrumb trail={[{ label: "Accueil", href: "/" }, { label: "Catalogue" }]} />

      <div className="mt-3.5 max-w-2xl">
        <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
          {isUpcoming ? "Les livres à paraître" : "Le catalogue par thèmes"}
        </h1>
      </div>

      <div className="mt-6 sm:mt-7">
        <CatalogueFilters
          collections={facets.collections}
          authors={facets.authors}
          totalCount={facets.total}
        />
      </div>

      <div className="mt-6 flex items-baseline justify-between gap-4 border-t-2 border-black pt-[18px]">
        <span className="font-sans text-[13px] font-bold uppercase tracking-[.03em] text-black">
          {total} {isUpcoming ? "titres à paraître" : "résultats"}
        </span>
        {totalPages > 1 && (
          <span className="font-sans text-xs font-bold uppercase tracking-[.03em] text-black/70">
            Page {page} sur {totalPages}
          </span>
        )}
      </div>

      <div className="mt-4">
        <BookGrid books={books} />
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
