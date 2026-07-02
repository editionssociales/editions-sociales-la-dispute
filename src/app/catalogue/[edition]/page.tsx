import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBooks, getFacets } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { Container } from "@/components/container";
import { Kicker } from "@/components/kicker";
import { Pagination } from "@/components/pagination";
import { parseBookFilters } from "@/lib/parse-filters";
import { ACCENT_TEXT } from "@/lib/accents";
import { EDITIONS, isEditionSlug } from "@/lib/editions";
import { PAGE_SIZE } from "@/lib/types";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ edition: string }>;
}): Promise<Metadata> {
  const { edition } = await params;
  if (!isEditionSlug(edition)) return {};
  return { title: EDITIONS[edition].name };
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
  const [allBooks, facets] = await Promise.all([getBooks(filters), getFacets(filters)]);

  const totalPages = Math.max(1, Math.ceil(allBooks.length / PAGE_SIZE));
  const page = Math.min(Math.max(filters.page ?? 1, 1), totalPages);
  const books = allBooks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams(
      Object.entries({ ...filters, edition: undefined, page: p === 1 ? undefined : String(p) }).flatMap(
        ([k, v]) => (v == null ? [] : [[k, String(v)]]),
      ),
    );
    const s = qs.toString();
    return s ? `/catalogue/${edition}?${s}` : `/catalogue/${edition}`;
  };

  return (
    <Container className="py-12">
      <header className="max-w-2xl">
        <Kicker accent={info.accent}>Le catalogue</Kicker>
        <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">
          {info.name}
        </h1>
        <p className="mt-4 text-ink-soft">
          <span
            className={`font-serif text-2xl font-semibold ${ACCENT_TEXT[info.accent]}`}
          >
            {allBooks.length}
          </span>{" "}
          titres · {info.tagline}
        </p>
      </header>

      <div className="mt-8 rounded-xl border border-line bg-paper-2 p-4 sm:p-5">
        <CatalogueFilters
          collections={facets.collections}
          authors={facets.authors}
          lockedEdition={edition}
        />
      </div>

      <div className="mt-10">
        <BookGrid books={books} />
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </Container>
  );
}
