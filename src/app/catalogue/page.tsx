import type { Metadata } from "next";
import { getBooks, getFacets } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { Container } from "@/components/container";
import { parseBookFilters } from "@/lib/parse-filters";

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Le catalogue commun des Éditions sociales et de La Dispute : filtrez par maison, collection et auteur.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseBookFilters(await searchParams);
  const [books, facets] = await Promise.all([
    getBooks(filters),
    getFacets(filters.edition),
  ]);

  return (
    <Container className="py-12">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-es">
          Catalogue commun
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold">Tous les livres</h1>
        <p className="mt-3 text-ink-soft">
          {books.length} titres des Éditions sociales et de La Dispute, réunis en
          un seul catalogue.
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
    </Container>
  );
}
