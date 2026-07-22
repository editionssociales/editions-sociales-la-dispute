import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { catalogueView, getBooks } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { CatalogueFilters } from "@/components/catalogue-filters";
import { CatalogueFallback } from "@/components/catalogue-fallback";
import { Container } from "@/components/container";
import { Pagination } from "@/components/pagination";
import { NouveautesCarousel } from "@/components/nouveautes-carousel";
import { toNouveauteBooks } from "@/lib/nouveaute-book";
import { parseBookFilters } from "@/lib/parse-filters";
import { catalogueHref } from "@/lib/browse";
import { NAV_BOUTIQUE } from "@/lib/nav";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

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

      {/* Le rayon boutique (goodies, manuels…) n'a pas sa place dans cette
          grille de livres — chantier 3 §1 : un lien contextuel évite qu'il
          reste invisible depuis le catalogue. */}
      <p className="max-w-2xl text-sm text-muted">
        Vous cherchez un objet plutôt qu&apos;un livre&nbsp;?{" "}
        <Link
          href={NAV_BOUTIQUE.href}
          className={`font-bold text-ink underline decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none hover:bg-ink hover:text-paper ${FOCUS_RING_LIGHT_OUTER}`}
        >
          Direction la {NAV_BOUTIQUE.label.toLowerCase()}
        </Link>
        .
      </p>

      <div className="mt-6 sm:mt-7">
        <CatalogueFilters
          libelles={[...facets.libelles].sort((a, b) => b.count - a.count)}
          authors={facets.authors}
          totalCount={facets.total}
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
