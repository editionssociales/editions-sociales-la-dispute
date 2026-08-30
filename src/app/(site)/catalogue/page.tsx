import type { Metadata } from "next";
import { Suspense } from "react";
import { catalogueView, getBooks } from "@/lib/catalogue";
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
import { NouveautesCarousel } from "@/components/nouveautes-carousel";
import { toNouveauteBooks } from "@/lib/nouveaute-book";
import { parseBookFilters } from "@/lib/parse-filters";
import { catalogueHref } from "@/lib/browse";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `?upcoming=1` (issue #87c) rend un h1 et un jeu de données différents
 * (`UpcomingCatalogueBody`) mais partageait jusqu'ici la canonique et le
 * titre de `/catalogue` — deux vues distinctes doivent avoir chacune leur
 * propre titre/canonique. Toute AUTRE combinaison de filtres (édition,
 * libellé, tri, page) reste canonicalisée vers la vue de base (E2 du plan) :
 * seule `upcoming` change le CONTENU du h1, pas seulement son tri/filtrage.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const raw = sp.upcoming;
  const upcoming = (Array.isArray(raw) ? raw[0] : raw) === "1";
  if (upcoming) {
    return {
      title: "À paraître",
      description:
        "Les prochaines parutions des Éditions sociales x La Dispute — livres à paraître, triés par date de parution.",
      alternates: { canonical: "/catalogue?upcoming=1" },
    };
  }
  return {
    title: "Catalogue",
    description:
      "Le catalogue des Éditions sociales x La Dispute : essais critiques, sciences sociales, philosophie et histoire du mouvement ouvrier.",
    alternates: { canonical: "/catalogue" },
  };
}

// Pas de `revalidate` ici (issue #74) : cette route lit `searchParams` et
// rend donc DYNAMIQUEMENT à chaque requête (`catalogue/error.tsx` le
// documente déjà) — un `revalidate = 3600` n'y décrivait rien de réel. La
// fraîcheur vient du data-cache tagué `catalogue` (`src/lib/catalogue.ts`,
// 24 h de filet, purgé par les hooks back-office), pas d'une fenêtre ISR de
// cette route. Les fiches livre/boutique, elles, gardent un vrai
// `revalidate = 86400` (pas de `searchParams`, ISR réelle).

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
      <NouveautesCarousel books={nouveautes} showArrows={false} showCatalogueLink={false} />
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

      {/* Même vue de libellés que /catalogue/[edition] (« index-manifeste »,
          vue unique — arbitrage client 2026-08-30) : glissée en SLOT sous la
          barre de recherche (2e passe du même jour — plus de cadre ni de
          bandeau « Tous les livres », le mot vit dans le paragraphe) ; les
          étiquettes de libellés des filtres sont masquées, cette vue couvre
          déjà ce rôle. */}
      {/* Provider de transition partagé (`catalogue-transition.tsx`) : les
          filtres y démarrent leurs navigations, la zone ci-dessous — compteur
          + grille + pagination, LES sous-arbres qui changent — s'estompe
          pendant qu'elles sont en vol. Enfants serveur passés en children. */}
      <CatalogueTransitionProvider>
        <CatalogueFilters
          libelles={facets.libelles}
          authors={facets.authors}
          hideLibelles
          libellesSlot={
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
          }
        />

        <CatalogueTransitionZone>
          {/* Live region (issue #86b) : le fallback de chargement (`CatalogueFallback`)
              annonce déjà « Chargement du catalogue… » côté AT — mais jamais le
              RÉSULTAT du filtrage une fois la vue rendue. `aria-live="polite"`
              fait lire le total à chaque changement de filtre/page (navigation
              interne, pas de rechargement complet). */}
          <div
            className="mt-6 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-[18px]"
            aria-live="polite"
          >
            <span className="font-sans text-[13px] font-bold uppercase tracking-[.03em] text-ink">
              {total} résultats
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
