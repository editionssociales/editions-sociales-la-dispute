import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { buildCatalogueView, type CatalogueView } from "./browse";
import { getBoutiqueOnlyBook, listBoutiqueOnlyBooks, pgCatalogueSource } from "./catalogue-pg";
import type { RawBook } from "./catalogue-source";
import {
  buildNativeBookDetail,
  buildNativeCatalogue,
  computeFacets,
  newReleases,
  queryBooks,
} from "./catalogue-core";
import type { Book, BookDetail, BookFilters, EditionSlug, Facet } from "./types";

export type { CatalogueView } from "./browse";

/**
 * Façade du catalogue unifié (server-only) — Payload/Postgres, SEULE source.
 *
 * Câble l'adaptateur pg au cœur pur (`catalogue-core`) et dédoublonne les
 * chargements par requête (`cache`). L'API publique — `getBooks`, `getFacets`,
 * `getBook`, `getNewReleases` — est inchangée pour les pages.
 *
 * L'axe WordPress/WooCommerce (adaptateur http, Store API, flags
 * `CATALOGUE_SOURCE`/`COMMERCE_NATIVE`) a été retiré à la coupure OVH :
 * contenu, ventes (prix TTC, stock, sellable) et articles boutique-seuls
 * viennent tous de la collection `books`. Un livre n'est jamais retiré du
 * catalogue faute d'être en vente : il est simplement marqué « à paraître »
 * ou « indisponible en ligne ».
 *
 * Cache data (`unstable_cache`, tag `catalogue`, 86400 s — filet de sécurité
 * quotidien) : `getAllBooks` ET `getBook` partagent désormais la MÊME source
 * brute cachée (`getRawCatalogue`, ci-dessous) — `getBook` ne fait plus sa
 * propre requête Payload, il cherche la fiche dans le jeu complet (édition +
 * slug). La fraîcheur temps réel vient de `revalidateTag('catalogue',
 * { expire: 0 })`, posé par `src/payload/hooks/revalidate-catalogue.ts` sur
 * les collections qui alimentent une fiche livre (livres, auteurs, libellés,
 * médias) — expiration bloquante, read-your-writes du back-office ; le filet
 * quotidien ne couvre que les écritures qui contournent les hooks (scripts,
 * migrations).
 */

const source = pgCatalogueSource();

/** Jeu brut complet du catalogue : les deux fonds (non résolus) + les boutique-seuls. */
interface RawCatalogue {
  rawByEdition: Partial<Record<EditionSlug, RawBook[]>>;
  boutiqueOnly: RawBook[];
}

async function loadRawCatalogue(): Promise<RawCatalogue> {
  const [es, ld, boutiqueOnly] = await Promise.all([
    source.listBooks("editions-sociales"),
    source.listBooks("la-dispute"),
    listBoutiqueOnlyBooks(),
  ]);
  return { rawByEdition: { "editions-sociales": es, "la-dispute": ld }, boutiqueOnly };
}

// `unstable_cache` exige un store Next (absent sous Vitest) — en test on
// appelle `loadRawCatalogue` directement ; en runtime Next, data-cache tagué
// `catalogue`, 86400 s.
const getRawCatalogueData =
  process.env.VITEST === "true"
    ? loadRawCatalogue
    : unstable_cache(loadRawCatalogue, ["catalogue-all-books"], {
        revalidate: 86400,
        tags: ["catalogue"],
      });

/**
 * Source brute, dédoublonnée par requête (`cache`) : UNIQUE point d'entrée du
 * data-cache pour `getAllBooks` ET `getBook` — sans cette couche, les deux
 * appelleraient chacun `getRawCatalogueData` séparément dans un même rendu.
 */
const getRawCatalogue = cache(async (): Promise<RawCatalogue> => getRawCatalogueData());

/** Catalogue unifié complet (deux fonds + boutique-seuls), mémoïsé par requête + data cache. */
export const getAllBooks = cache(async (): Promise<Book[]> => {
  const { rawByEdition, boutiqueOnly } = await getRawCatalogue();
  return buildNativeCatalogue(rawByEdition, boutiqueOnly);
});

/** Applique filtres + tri (pagination gérée par l'appelant). */
export async function getBooks(filters: BookFilters = {}): Promise<Book[]> {
  return queryBooks(await getAllBooks(), filters);
}

export async function getNewReleases(limit = 8): Promise<Book[]> {
  return newReleases(await getBooks({ sort: "recent" }), limit);
}

export async function getFacets(
  filters: BookFilters = {},
): Promise<{ libelles: Facet[]; authors: Facet[]; total: number }> {
  return computeFacets(await getAllBooks(), filters);
}

/** Vue catalogue complète (livres paginés + facettes) pour une page donnée. */
export async function catalogueView(filters: BookFilters = {}): Promise<CatalogueView> {
  const [all, facets] = await Promise.all([getBooks(filters), getFacets(filters)]);
  return buildCatalogueView(all, facets, filters);
}

/**
 * Fiche complète d'un livre (par édition + slug) — dérivée du jeu complet
 * caché (`getRawCatalogue`), plus de requête Payload dédiée : `listBooks` et
 * l'ancien appel individuel de `catalogue-pg.ts` font tous deux `depth: 2`
 * avec le même mapper (`payloadBookToRawBook`), la fiche brute d'un livre de
 * la liste est donc identique à celle d'une requête ciblée. Absent pour un
 * article boutique-only.
 */
export const getBook = cache(
  async (edition: EditionSlug, slug: string): Promise<BookDetail | null> => {
    const { rawByEdition } = await getRawCatalogue();
    const raw = (rawByEdition[edition] ?? []).find((b) => b.slug === slug);
    if (!raw) return null;
    return buildNativeBookDetail(edition, raw, `/catalogue/${edition}/${slug}`);
  },
);

/** Paramètres de génération statique pour les fiches (livres issus d'une fiche catalogue). */
export async function getAllBookParams(): Promise<{ edition: EditionSlug; slug: string }[]> {
  const books = await getAllBooks();
  return books
    .filter((b): b is Book & { edition: EditionSlug } => b.edition != null)
    .map((b) => ({ edition: b.edition, slug: b.slug }));
}

/* --------------------------------- boutique-seuls --------------------------------- */

/**
 * Articles boutique-seuls (`origin: "boutique"`, `edition: null` — goodies,
 * manuels…). Le tri suit celui de `getAllBooks` (titre, pas de pagination —
 * la grille `/boutique` reste courte, ~15-20 articles).
 */
export async function getBoutiqueBooks(): Promise<Book[]> {
  const all = await getAllBooks();
  return all
    .filter((b) => b.origin === "boutique")
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

/**
 * Fiche d'un article boutique-seul (`/boutique/[slug]`). Mémoïsée par requête
 * (`generateMetadata` + la page appellent toutes deux, même slug).
 */
export const getBoutiqueBook = cache(async (slug: string): Promise<BookDetail | null> => {
  const raw = await getBoutiqueOnlyBook(slug);
  if (!raw) return null;
  return buildNativeBookDetail(null, raw, `/boutique/${slug}`, "boutique");
});

/** Paramètres de génération statique pour les fiches boutique-seules. */
export async function getAllBoutiqueParams(): Promise<{ slug: string }[]> {
  const books = await getBoutiqueBooks();
  return books.map((b) => ({ slug: b.slug }));
}
