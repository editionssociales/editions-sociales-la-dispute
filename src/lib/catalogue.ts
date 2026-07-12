import "server-only";
import { cache } from "react";
import { buildCatalogueView, type CatalogueView } from "./browse";
import { httpCatalogueSource } from "./catalogue-http";
import { getBoutiqueOnlyBook, listBoutiqueOnlyBooks, pgCatalogueSource } from "./catalogue-pg";
import {
  buildBookDetail,
  buildCatalogueForFlag,
  buildNativeBookDetail,
  computeFacets,
  countByEdition,
  newReleases,
  queryBooks,
} from "./catalogue-core";
import { isCommerceNative } from "./env";
import type { Book, BookDetail, BookFilters, EditionSlug, Facet } from "./types";

export type { CatalogueView } from "./browse";

/**
 * Façade du catalogue unifié (server-only).
 *
 * Câble l'adaptateur http (ou pg, `CATALOGUE_SOURCE=pg`) au cœur pur
 * (`catalogue-core`) et dédoublonne les chargements par requête (`cache`).
 * L'API publique — `getBooks`, `getFacets`, `getBook`, `getNewReleases`,
 * `countBooks` — est inchangée pour les pages catalogue.
 *
 * `COMMERCE_NATIVE` (plan §4 étape 11) gouverne, INDÉPENDAMMENT de
 * `CATALOGUE_SOURCE`, d'où viennent les données de VENTE (prix TTC, stock,
 * sellable) : à `0` (défaut), la Store API WooCommerce, quel que soit le
 * contenu (`CATALOGUE_SOURCE`) ; à `1`, Payload — plus aucun appel Store API,
 * `source.listProducts()` n'est même plus invoqué. C'est aussi ce flag qui
 * fait apparaître les articles boutique-seuls (`listBoutiqueOnlyBooks`,
 * `/boutique`, plan §4 étape 7) : à `0` ils restent des extras dérivés des
 * produits Woo non réclamés (`buildCatalogue`, inchangé).
 *
 * Un livre n'est jamais retiré du catalogue faute d'être en vente : il est
 * simplement marqué « à paraître » ou « indisponible en ligne ».
 */

// Point de bascule unique (E4 du plan) : WordPress reste la source de vérité
// du CONTENU tant que `CATALOGUE_SOURCE` n'est pas posée à `pg` — rollback =
// flip d'env. Indépendant de `COMMERCE_NATIVE` (ventes, cf. ci-dessus).
const source =
  process.env.CATALOGUE_SOURCE === "pg" ? pgCatalogueSource() : httpCatalogueSource();

/** Catalogue unifié complet (deux fonds + boutique), mémoïsé par requête. */
export const getAllBooks = cache(async (): Promise<Book[]> => {
  const nativeCommerce = isCommerceNative();
  const [es, ld, products, boutiqueOnly] = await Promise.all([
    source.listBooks("editions-sociales"),
    source.listBooks("la-dispute"),
    // Plus aucun appel Store API à `COMMERCE_NATIVE=1` : `buildCatalogueForFlag`
    // ignore `products` dans ce cas, mais on évite même l'aller-retour réseau.
    nativeCommerce ? Promise.resolve([]) : source.listProducts(),
    nativeCommerce ? listBoutiqueOnlyBooks() : Promise.resolve([]),
  ]);
  return buildCatalogueForFlag(
    nativeCommerce,
    { "editions-sociales": es, "la-dispute": ld },
    products,
    boutiqueOnly,
  );
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
    if (isCommerceNative()) {
      return buildNativeBookDetail(edition, raw, `/catalogue/${edition}/${slug}`);
    }
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

/* --------------------- boutique-seuls (COMMERCE_NATIVE=1, plan §4 étape 7) --------------------- */

/**
 * Articles boutique-seuls (`origin: "boutique"`) — que le commerce natif
 * soit actif ou non : à `0`, ce sont les extras dérivés des produits Woo non
 * réclamés (`buildCatalogue`) ; à `1`, les fiches Payload `edition: null`
 * (`buildNativeCatalogue`). Le tri suit celui de `getAllBooks` (titre, pas de
 * pagination — la grille `/boutique` reste courte, ~15-20 articles).
 */
export async function getBoutiqueBooks(): Promise<Book[]> {
  const all = await getAllBooks();
  return all
    .filter((b) => b.origin === "boutique")
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

/**
 * Fiche d'un article boutique-seul (`/boutique/[slug]`) — uniquement en
 * commerce natif : à `COMMERCE_NATIVE=0` la route redirige vers `/catalogue`
 * (règle d'or du lot), cette fonction n'est jamais appelée. Mémoïsée par
 * requête (`generateMetadata` + la page appellent toutes deux, même slug).
 */
export const getBoutiqueBook = cache(async (slug: string): Promise<BookDetail | null> => {
  const raw = await getBoutiqueOnlyBook(slug);
  if (!raw) return null;
  return buildNativeBookDetail(null, raw, `/boutique/${slug}`, "boutique");
});

/** Paramètres de génération statique pour les fiches boutique-seules (commerce natif uniquement). */
export async function getAllBoutiqueParams(): Promise<{ slug: string }[]> {
  if (!isCommerceNative()) return [];
  const books = await getBoutiqueBooks();
  return books.map((b) => ({ slug: b.slug }));
}
