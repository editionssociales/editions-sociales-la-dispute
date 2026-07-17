import "server-only";
import type { CatalogueSource, RawBook } from "./catalogue-source";
import { wpBookToRawBook, type WpBook } from "./catalogue-wp-map";
import { fetchAllPages } from "./fetch-all-pages";
import type { EditionSlug } from "./types";

/**
 * Adaptateur http du port `CatalogueSource` (prod) — mode WordPress *headless*.
 *
 * Seul point qui touche le réseau : REST WP (CPT `catalogue`, taxonomies + ACF
 * réexposés par le mu-plugin `wp-headless/es-headless-rest.php`). Le dialecte
 * du fil WP est absorbé par `catalogue-wp-map.ts` ; fusion et requêtes vivent
 * dans `catalogue-core.ts`. Les produits boutique (WooCommerce Store API) ne
 * sont plus portés par cet adaptateur : `catalogue.ts` appelle directement
 * `getAllStoreProducts()` (`boutique.ts`) — cf. `catalogue-source.ts`.
 */

const SITES: Record<EditionSlug, string> = {
  "editions-sociales": process.env.WP_ES_URL || "https://editionssociales.fr",
  "la-dispute": process.env.WP_LD_URL || "https://ladispute.fr",
};
const REVALIDATE = Number(process.env.WP_REVALIDATE ?? "3600");

async function wpGet<T>(base: string, path: string): Promise<T> {
  const res = await fetch(`${base}/wp-json/wp/v2/${path}`, {
    next: { revalidate: REVALIDATE },
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`WP REST ${base}/${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** Toutes les fiches brutes d'un fonds (pagination `fetch-all-pages`, résilient). */
async function listBooks(edition: EditionSlug): Promise<RawBook[]> {
  const base = SITES[edition];
  const perPage = 100;
  const items = await fetchAllPages<WpBook>({
    perPage,
    maxPages: 20,
    fetchPage: (page) =>
      wpGet<WpBook[]>(
        base,
        `catalogue?per_page=${perPage}&page=${page}&orderby=date&order=desc&_fields=id,slug,title,book`,
      ),
    // 400 attendu au-delà de la dernière page ; on ne loggue qu'un vrai échec.
    onPageError: (err, page) => {
      if (page === 1) console.error(`[catalogue] ${edition} indisponible:`, err);
    },
  });
  return items.map(wpBookToRawBook);
}

async function getBook(edition: EditionSlug, slug: string): Promise<RawBook | null> {
  const base = SITES[edition];
  let items: WpBook[];
  try {
    items = await wpGet<WpBook[]>(
      base,
      `catalogue?slug=${encodeURIComponent(slug)}&_fields=id,slug,title,content,book`,
    );
  } catch {
    return null;
  }
  const item = Array.isArray(items) ? (items[0] ?? null) : null;
  return item ? wpBookToRawBook(item) : null;
}

export function httpCatalogueSource(): CatalogueSource {
  return {
    listBooks,
    getBook,
  };
}
