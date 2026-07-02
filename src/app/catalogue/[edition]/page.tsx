import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBooks, getFacets } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { BlockMenu, type BlockCell } from "@/components/block-menu";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { Container } from "@/components/container";
import { Kicker } from "@/components/kicker";
import { Pagination } from "@/components/pagination";
import { parseBookFilters, serializeBookFilters } from "@/lib/parse-filters";
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

/**
 * Poids visuel d'une cellule du menu thèmes selon son nombre de titres —
 * identique à /catalogue (voir ce fichier pour le détail de la pondération).
 */
const THEME_TIERS: { min: number; span: string; text: string }[] = [
  {
    min: 16,
    span: "col-span-2 lg:col-span-3 row-span-2",
    text: "text-[clamp(14px,1.5vw,20px)] lg:text-[clamp(19px,2vw,29px)]",
  },
  { min: 12, span: "col-span-2 row-span-2", text: "text-[clamp(14px,1.5vw,20px)]" },
  { min: 9, span: "col-span-2 row-span-1", text: "text-[clamp(14px,1.5vw,20px)]" },
  { min: 7, span: "col-span-1 row-span-2", text: "text-[clamp(12px,1.2vw,15px)]" },
  { min: 0, span: "col-span-1 row-span-1", text: "text-[clamp(12px,1.2vw,15px)]" },
];

function themeTier(count: number) {
  return THEME_TIERS.find((t) => count >= t.min) ?? THEME_TIERS[THEME_TIERS.length - 1];
}

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
  const isUpcoming = filters.upcoming === true;
  const basePath = `/catalogue/${edition}`;

  const hrefFor = (p: number) => {
    const qs = serializeBookFilters({ ...filters, edition: undefined, page: p > 1 ? p : undefined });
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const themeItems: { name: string; slug: string | null; count: number }[] = [
    { name: "Tous les livres", slug: null, count: facets.total },
    ...facets.collections,
  ];
  const themeCells: BlockCell[] = themeItems.map((item) => {
    const tier = themeTier(item.count);
    const active = (item.slug ?? undefined) === filters.collection;
    const qs = serializeBookFilters({
      ...filters,
      edition: undefined,
      collection: item.slug ?? undefined,
      page: undefined,
    });
    const s = qs.toString();
    return {
      key: item.slug ?? "all",
      variant: active ? "actif" : "lien",
      href: s ? `${basePath}?${s}` : basePath,
      ariaCurrent: active,
      className: `relative flex flex-col justify-end gap-1.5 overflow-hidden px-[17px] py-[15px] ${tier.span}`,
      label: item.name,
      labelClassName: `font-sans font-bold uppercase leading-[1.02] tracking-[.04em] ${tier.text}`,
      note: `${item.count} titres${active ? " · actif" : ""}`,
      noteClassName: "font-sans text-[11px] tracking-[.05em] opacity-60",
    };
  });

  return (
    <Container className="py-12">
      <nav aria-label="Fil d'ariane" className="font-sans text-[13px] text-muted">
        <Link
          href="/"
          className="text-ink-soft transition-colors motion-reduce:transition-none hover:text-ink"
        >
          Accueil
        </Link>
        <span aria-hidden="true" className="px-1.5 opacity-50">
          /
        </span>
        <Link
          href="/catalogue"
          className="text-ink-soft transition-colors motion-reduce:transition-none hover:text-ink"
        >
          Catalogue
        </Link>
        <span aria-hidden="true" className="px-1.5 opacity-50">
          /
        </span>
        <span className="text-ink">{info.name}</span>
      </nav>

      <div className="mt-3.5 max-w-2xl">
        <Kicker accent="ocher">Explorer</Kicker>
        <h1 className="mt-2 font-serif text-4xl font-bold sm:text-5xl">{info.name}</h1>
        <p className="mt-3.5 text-[15px] leading-relaxed text-ink-soft">
          {info.tagline} Chaque bloc est une collection de la maison&nbsp;; sa taille dépend du
          nombre de titres. Cliquez pour filtrer — le bloc actif reste en blanc.
        </p>
      </div>

      <BlockMenu
        cells={themeCells}
        ariaLabel={`Thèmes du catalogue ${info.name}`}
        cols="grid-cols-2 lg:grid-cols-6"
        className="mt-6 grid grid-flow-row-dense auto-rows-[clamp(62px,7vw,92px)] sm:mt-7"
      />

      <div className="mt-6">
        <CatalogueFilters
          collections={facets.collections}
          authors={facets.authors}
          lockedEdition={edition}
        />
      </div>

      <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-line pt-[18px]">
        <span className="font-sans text-[13px] text-ink-soft">
          {allBooks.length} {isUpcoming ? "titres à paraître" : "résultats"}
        </span>
        {totalPages > 1 && (
          <span className="font-sans text-xs text-muted">
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
