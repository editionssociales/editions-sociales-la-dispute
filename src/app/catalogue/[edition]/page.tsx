import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBooks, getFacets } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { Container } from "@/components/container";
import { Pagination } from "@/components/pagination";
import { parseBookFilters } from "@/lib/parse-filters";
import { catalogueHref, paginate } from "@/lib/browse";
import { FOCUS_RING, invertingCell } from "@/lib/ui";
import { EDITIONS, isEditionSlug } from "@/lib/editions";

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
 * Poids visuel d'une cellule de la mosaïque de thèmes selon son nombre de
 * titres — grille brutaliste (quadrillage noir 2px), cellule active inversée
 * en noir/blanc comme les étiquettes de CatalogueFilters ci-dessous.
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

/** Cellule de la mosaïque de thèmes — inversion noir/blanc à l'état actif. */
function ThemeCell({
  href,
  active,
  span,
  textClass,
  label,
  count,
}: {
  href: string;
  active: boolean;
  span: string;
  textClass: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col justify-end gap-1.5 overflow-hidden px-[17px] py-[15px] transition-colors motion-reduce:transition-none focus-visible:z-[2] ${FOCUS_RING} ${span} ${invertingCell(active)}`}
    >
      <span className={`font-sans font-black uppercase leading-[1.02] tracking-[.01em] ${textClass}`}>
        {label}
      </span>
      <span className="font-sans text-[11px] font-bold uppercase tracking-[.05em] opacity-60">
        {count} titres{active ? " · actif" : ""}
      </span>
    </Link>
  );
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

  const { items: books, page, totalPages } = paginate(allBooks, filters.page);
  const isUpcoming = filters.upcoming === true;
  const basePath = `/catalogue/${edition}`;

  const hrefFor = (p: number) =>
    catalogueHref({ ...filters, edition: undefined, page: p }, basePath);

  const themeItems: { name: string; slug: string | null; count: number }[] = [
    { name: "Tous les livres", slug: null, count: facets.total },
    ...facets.collections,
  ];

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
        <Link
          href="/catalogue"
          className="transition-colors motion-reduce:transition-none hover:text-black"
        >
          Catalogue
        </Link>
        <span aria-hidden="true" className="px-1.5">
          /
        </span>
        <span className="text-black">{info.name}</span>
      </nav>

      <div className="mt-3.5 max-w-2xl">
        <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
          Explorer
        </p>
        <h1 className="mt-2 font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
          {info.name}
        </h1>
        <p className="mt-3.5 text-[15px] leading-relaxed text-black/70">
          {info.tagline} Chaque cellule est une collection de la maison&nbsp;; sa taille dépend
          du nombre de titres. Cliquez pour filtrer — la cellule active s&rsquo;inverse en noir.
        </p>
      </div>

      <nav
        aria-label={`Thèmes du catalogue ${info.name}`}
        className="mt-6 grid grid-flow-row-dense auto-rows-[clamp(62px,7vw,92px)] grid-cols-2 gap-[2px] bg-black p-[2px] sm:mt-7 lg:grid-cols-6"
      >
        {themeItems.map((item) => {
          const tier = themeTier(item.count);
          const active = (item.slug ?? undefined) === filters.collection;
          const href = catalogueHref(
            { ...filters, edition: undefined, collection: item.slug ?? undefined, page: undefined },
            basePath,
          );
          return (
            <ThemeCell
              key={item.slug ?? "all"}
              href={href}
              active={active}
              span={tier.span}
              textClass={tier.text}
              label={item.name}
              count={item.count}
            />
          );
        })}
      </nav>

      <div className="mt-6">
        <CatalogueFilters
          collections={facets.collections}
          authors={facets.authors}
          lockedEdition={edition}
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
