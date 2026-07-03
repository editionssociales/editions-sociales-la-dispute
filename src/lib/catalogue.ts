import "server-only";
import { cache } from "react";
import { buildCatalogueView, type CatalogueView } from "./browse";
import { httpCatalogueSource } from "./catalogue-http";
import {
  buildBookDetail,
  buildCatalogue,
  computeFacets,
  countByEdition,
  newReleases,
  queryBooks,
} from "./catalogue-core";
import type { Book, BookDetail, BookFilters, EditionSlug, Facet } from "./types";

export type { CatalogueView } from "./browse";

/**
 * Façade du catalogue unifié (server-only).
 *
 * Câble l'adaptateur http au cœur pur (`catalogue-core`) et dédoublonne les
 * chargements par requête (`cache`). L'API publique — `getBooks`, `getFacets`,
 * `getBook`, `getNewReleases`, `countBooks` — est inchangée pour les pages ;
 * elle n'expose plus ni fetch ni logique, seulement l'orchestration.
 *
 * Un livre n'est jamais retiré du catalogue faute d'être en vente : il est
 * simplement marqué « à paraître » ou « indisponible en ligne ».
 */

const source = httpCatalogueSource();

/** Catalogue unifié complet (deux fonds + boutique), mémoïsé par requête. */
export const getAllBooks = cache(async (): Promise<Book[]> => {
  const [es, ld, products] = await Promise.all([
    source.listBooks("editions-sociales"),
    source.listBooks("la-dispute"),
    source.listProducts(),
  ]);
  return buildCatalogue({ "editions-sociales": es, "la-dispute": ld }, products);
});

/** Applique filtres + tri (pagination gérée par l'appelant). */
export async function getBooks(filters: BookFilters = {}): Promise<Book[]> {
  return queryBooks(await getAllBooks(), filters);
}

export async function getNewReleases(limit = 8): Promise<Book[]> {
  return newReleases(await getBooks({ sort: "recent" }), limit);
}

export async function countBooks(edition?: EditionSlug): Promise<number> {
  return countByEdition(await getAllBooks(), edition);
}

export async function getFacets(
  filters: BookFilters = {},
): Promise<{ collections: Facet[]; authors: Facet[]; total: number }> {
  return computeFacets(await getAllBooks(), filters);
}

/** Vue catalogue complète (livres paginés + facettes) pour une page donnée. */
export async function catalogueView(filters: BookFilters = {}): Promise<CatalogueView> {
  const [all, facets] = await Promise.all([getBooks(filters), getFacets(filters)]);
  return buildCatalogueView(all, facets, filters);
}

/** Fiche complète d'un livre (par édition + slug). Absent pour un article boutique-only. */
export const getBook = cache(
  async (edition: EditionSlug, slug: string): Promise<BookDetail | null> => {
    const raw = await source.getBook(edition, slug);
    if (!raw) return null;
    const products = await source.listProducts();
    return buildBookDetail(edition, raw, products);
  },
);

/** Paramètres de génération statique pour les fiches (livres issus d'une fiche catalogue). */
export async function getAllBookParams(): Promise<{ edition: EditionSlug; slug: string }[]> {
  const books = await getAllBooks();
  return books
    .filter((b): b is Book & { edition: EditionSlug } => b.edition != null)
    .map((b) => ({ edition: b.edition, slug: b.slug }));
}
