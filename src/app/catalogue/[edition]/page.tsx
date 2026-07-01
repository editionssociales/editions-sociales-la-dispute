import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBooks, getFacets } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { Container } from "@/components/container";
import { parseBookFilters } from "@/lib/parse-filters";
import { EDITIONS, isEditionSlug } from "@/lib/editions";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ edition: string }>;
}): Promise<Metadata> {
  const { edition } = await params;
  if (!isEditionSlug(edition)) return {};
  return { title: `Catalogue ${EDITIONS[edition].name}` };
}

export const dynamic = "force-dynamic";

export default async function EditionCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { edition } = await params;
  if (!isEditionSlug(edition)) notFound();
  const info = EDITIONS[edition];

  const filters = { ...parseBookFilters(await searchParams), edition };
  const [books, facets] = await Promise.all([
    getBooks(filters),
    getFacets(edition),
  ]);

  return (
    <Container className="py-12">
      <header className="max-w-2xl">
        <p
          className="text-sm font-semibold uppercase tracking-[0.18em]"
          style={{ color: `var(--color-${info.accent})` }}
        >
          {info.name}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold">Catalogue</h1>
        <p className="mt-3 text-ink-soft">
          {books.length} titres · {info.tagline}
        </p>
      </header>

      <div className="mt-8 border-y border-line py-6">
        <CatalogueFilters
          collections={facets.collections}
          authors={facets.authors}
          lockedEdition={edition}
        />
      </div>

      <div className="mt-10">
        <BookGrid books={books} />
      </div>
    </Container>
  );
}
