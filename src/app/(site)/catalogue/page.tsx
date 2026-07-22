import type { Metadata } from "next";
import { Suspense } from "react";
import { catalogueView, getBooks } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { CatalogueFallback } from "@/components/catalogue-fallback";
import { Container } from "@/components/container";
import { Pagination } from "@/components/pagination";
import { LibelleMosaic } from "@/components/libelle-mosaic";
import { NouveautesCarousel } from "@/components/nouveautes-carousel";
import { toNouveauteBooks } from "@/lib/nouveaute-book";
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

/**
 * Vue « à paraître » (`?upcoming=1`) — épure minimaliste : plus de grille ni
 * de filtres, seulement le même carrousel que l'accueil, alimenté par les
 * livres à paraître triés par date de parution croissante (le plus proche
 * en premier). Le h1 sr-only reprend le titre que portait l'ex-`PageHero`.
 */
async function UpcomingCatalogueBody() {
  const books = await getBooks({ upcoming: true, sort: "ancien" });
  const nouveautes = toNouveauteBooks(books);

  return (
    <Container className="bg-paper py-12 sm:py-16">
      <h1 className="sr-only">Les livres à paraître</h1>
      <NouveautesCarousel books={nouveautes} />
    </Container>
  );
}

async function CatalogueBody({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseBookFilters(await searchParams);
  if (filters.upcoming) {
    return <UpcomingCatalogueBody />;
  }

  const { books, page, totalPages, total, facets } = await catalogueView(filters);

  const hrefFor = (p: number) => catalogueHref({ ...filters, page: p });
  // Sortie de l'état « 0 résultat » : repart du catalogue complet (tri
  // conservé), même logique que « Tout effacer » côté filtres.
  const resetHref = catalogueHref({ sort: filters.sort });

  return (
    <Container className="bg-paper py-12 sm:py-16">
      {/* Épure minimaliste : l'ex-PageHero (titre + chapeau) a été retiré —
          le h1 devient invisible (a11y/SEO seuls), rien ne porte plus ce
          rôle visuellement. */}
      <h1 className="sr-only">Le catalogue par libellés</h1>

      {/* Même mosaïque pondérée que /catalogue/[edition] (vue « GEME »
          retenue par le client — les cases suivent le nombre de titres) ;
          les étiquettes de libellés des filtres ci-dessous sont masquées,
          la mosaïque couvre déjà ce rôle. */}
      <LibelleMosaic
        items={[
          { name: "Tous les livres", slug: null, count: facets.total },
          ...facets.libelles,
        ]}
        activeLibelle={filters.libelle}
        hrefFor={(slug) =>
          catalogueHref({ ...filters, libelle: slug ?? undefined, page: undefined })
        }
        ariaLabel="Libellés du catalogue"
      />

      <div className="mt-6">
        <CatalogueFilters
          libelles={facets.libelles}
          authors={facets.authors}
          hideLibelles
        />
      </div>

      <div className="mt-6 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-[18px]">
        <span className="font-sans text-[13px] font-bold uppercase tracking-[.03em] text-ink">
          {total} résultats
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
