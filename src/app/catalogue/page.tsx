import type { Metadata } from "next";
import { getBooks, getFacets } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { Container } from "@/components/container";
import { Pagination } from "@/components/pagination";
import { parseBookFilters } from "@/lib/parse-filters";
import { PAGE_SIZE } from "@/lib/types";

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

  const totalPages = Math.max(1, Math.ceil(allBooks.length / PAGE_SIZE));
  const page = Math.min(Math.max(filters.page ?? 1, 1), totalPages);
  const books = allBooks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams(
      Object.entries({ ...filters, page: p === 1 ? undefined : String(p) }).flatMap(([k, v]) =>
        v == null ? [] : [[k, String(v)]],
      ),
    );
    const s = qs.toString();
    return s ? `/catalogue?${s}` : "/catalogue";
  };

  return (
    <Container className="py-12">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold">Le catalogue</h1>
        <p className="mt-3 text-ink-soft">
          {allBooks.length} titres à découvrir, filtrer et commander.
        </p>
      </header>

      <div className="mt-8 border-y border-line py-6">
        <CatalogueFilters
          collections={facets.collections}
          authors={facets.authors}
        />
      </div>

      <div className="mt-10">
        <BookGrid books={books} />
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </Container>
  );
}
