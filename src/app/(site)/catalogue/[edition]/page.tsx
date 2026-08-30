import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { catalogueView } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import {
  CatalogueTransitionProvider,
  CatalogueTransitionZone,
} from "@/components/catalogue-transition";
import { CatalogueFallback } from "@/components/catalogue-fallback";
import { Container } from "@/components/container";
import { Pagination } from "@/components/pagination";
import { LibelleMosaic } from "@/components/libelle-mosaic";
import { parseBookFilters } from "@/lib/parse-filters";
import { catalogueHref } from "@/lib/browse";
import { EDITIONS, isEditionSlug } from "@/lib/editions";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ edition: string }>;
}): Promise<Metadata> {
  const { edition } = await params;
  if (!isEditionSlug(edition)) return {};
  return {
    // Titre absolu « Catalogue <maison> » : avec le suffixe du template, le
    // nom de la maison apparaîtrait deux fois (« Catalogue Les Éditions
    // sociales — Les Éditions sociales × La Dispute »).
    title: { absolute: `Catalogue ${EDITIONS[edition].name}` },
    // Sans query string : les vues filtrées/paginées canonicalisent vers la
    // vue de base (E2 du plan).
    alternates: { canonical: `/catalogue/${edition}` },
  };
}

// Pas de `revalidate` ici (issue #74) : cette route lit `searchParams` et
// rend donc DYNAMIQUEMENT à chaque requête (`catalogue/error.tsx` le
// documente déjà) — un `revalidate = 3600` n'y décrivait rien de réel. La
// fraîcheur vient du data-cache tagué `catalogue` (`src/lib/catalogue.ts`,
// 24 h de filet, purgé par les hooks back-office), pas d'une fenêtre ISR de
// cette route. Les fiches livre/boutique, elles, gardent un vrai
// `revalidate = 86400` (pas de `searchParams`, ISR réelle).

async function EditionCatalogueBody({
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
  const { books, page, totalPages, total, isUpcoming, facets } = await catalogueView(filters);
  const basePath = `/catalogue/${edition}`;

  const hrefFor = (p: number) =>
    catalogueHref({ ...filters, edition: undefined, page: p }, basePath);
  // Sortie de l'état « 0 résultat » : repart du catalogue de l'édition (tri
  // conservé), même logique que « Tout effacer » côté filtres.
  const resetHref = catalogueHref({ sort: filters.sort }, basePath);

  // Ordre alphabétique des libellés (getFacets) — l'index-manifeste trie sa
  // propre copie par count pour l'ordre de LECTURE (cf. `libelle-mosaic.tsx`,
  // arbitrage client 2026-08-30).
  // « Tous les livres » reste épinglée en tête (pas un vrai libellé).
  const libelleItems: { name: string; slug: string | null; count: number }[] = [
    { name: "Tous les livres", slug: null, count: facets.total },
    ...facets.libelles,
  ];

  return (
    <Container className="bg-paper py-12 sm:py-16">
      {/* Épure minimaliste : l'ex-PageHero (titre + chapeau) a été retiré —
          le h1 devient invisible (a11y/SEO seuls), rien ne porte plus ce
          rôle visuellement. */}
      <h1 className="sr-only">{info.name}</h1>

      {/* Provider de transition partagé — même montage que `catalogue/page.tsx`
          (cf. `catalogue-transition.tsx`). */}
      <CatalogueTransitionProvider>
        {/* Index-manifeste en slot sous la recherche — même montage que
            `catalogue/page.tsx` (2e passe du 2026-08-30). */}
        <CatalogueFilters
          libelles={facets.libelles}
          authors={facets.authors}
          lockedEdition={edition}
          hideLibelles
          libellesSlot={
            <LibelleMosaic
              items={libelleItems}
              activeLibelle={filters.libelle}
              hrefFor={(slug) =>
                catalogueHref(
                  { ...filters, edition: undefined, libelle: slug ?? undefined, page: undefined },
                  basePath,
                )
              }
              ariaLabel={`Libellés du catalogue ${info.name}`}
            />
          }
        />

        <CatalogueTransitionZone>
          <div className="mt-6 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-[18px]">
            <span className="font-sans text-[13px] font-bold uppercase tracking-[.03em] text-ink">
              {total} {isUpcoming ? "titres à paraître" : "résultats"}
            </span>
          </div>

          <div className="mt-4">
            <BookGrid books={books} resetHref={resetHref} />
          </div>

          <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
        </CatalogueTransitionZone>
      </CatalogueTransitionProvider>
    </Container>
  );
}

export default function EditionCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<CatalogueFallback />}>
      <EditionCatalogueBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}
