import type { Metadata } from "next";
import Link from "next/link";
import { getBooks, getFacets } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { Container } from "@/components/container";
import { Pagination } from "@/components/pagination";
import { parseBookFilters } from "@/lib/parse-filters";
import { catalogueHref, paginate } from "@/lib/browse";

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Le catalogue des Éditions sociales x La Dispute : essais critiques, sciences sociales, philosophie et histoire du mouvement ouvrier.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseBookFilters(await searchParams);
  const [allBooks, facets] = await Promise.all([getBooks(filters), getFacets(filters)]);

  const { items: books, page, totalPages } = paginate(allBooks, filters.page);
  const isUpcoming = filters.upcoming === true;

  const hrefFor = (p: number) => catalogueHref({ ...filters, page: p });

  return (
    <Container className="bg-white py-12">
      <nav
        aria-label="Fil d'ariane"
        className="font-sans text-xs font-bold uppercase tracking-[.06em] text-black/60"
      >
        <Link
          href="/"
          className="transition-colors motion-reduce:transition-none hover:text-black"
        >
          Accueil
        </Link>
        <span aria-hidden="true" className="px-1.5">
          /
        </span>
        <span className="text-black">Catalogue</span>
      </nav>

      <div className="mt-3.5 max-w-2xl">
        <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
          Explorer
        </p>
        <h1 className="mt-2 font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
          {isUpcoming ? "Les livres à paraître" : "Le catalogue par thèmes"}
        </h1>
        <p className="mt-3.5 text-[15px] leading-relaxed text-black/70">
          Chaque étiquette filtre le catalogue des deux maisons. Cliquez pour affiner — l&rsquo;étiquette
          active s&rsquo;inverse en noir.
        </p>
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
          {allBooks.length} {isUpcoming ? "titres à paraître" : "résultats"}
        </span>
        {totalPages > 1 && (
          <span className="font-sans text-xs font-bold uppercase tracking-[.03em] text-black/50">
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
