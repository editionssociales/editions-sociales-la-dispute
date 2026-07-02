import "server-only";
import { getAllStoreProducts } from "./boutique";
import type { CatalogueSource, WpBook } from "./catalogue-source";
import type { EditionSlug } from "./types";

/**
 * Adaptateur http du port `CatalogueSource` (prod) — mode WordPress *headless*.
 *
 * Seul point qui touche le réseau : REST WP (CPT `catalogue`, taxonomies + ACF
 * réexposés par le mu-plugin `wp-headless/es-headless-rest.php`) et, via
 * `boutique.ts`, la WooCommerce Store API. Renvoie du **brut** ; la
 * transformation et les requêtes vivent dans `catalogue-core.ts`.
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

/** Toutes les fiches brutes d'un fonds (pagination interne, résilient). */
async function listBooks(edition: EditionSlug): Promise<WpBook[]> {
  const base = SITES[edition];
  const perPage = 100;
  const out: WpBook[] = [];
  for (let page = 1; page <= 20; page++) {
    let items: WpBook[];
    try {
      items = await wpGet<WpBook[]>(
        base,
        `catalogue?per_page=${perPage}&page=${page}&orderby=date&order=desc&_fields=id,slug,title,book`,
      );
      // Corps 200 non-liste (erreur WP sérialisée) : on renvoie ce qu'on a plutôt que planter.
      if (!Array.isArray(items)) break;
    } catch (err) {
      // 400 attendu au-delà de la dernière page ; on ne loggue qu'un vrai échec.
      if (page === 1) console.error(`[catalogue] ${edition} indisponible:`, err);
      break;
    }
    out.push(...items);
    if (items.length < perPage) break;
  }
  return out;
}

async function getBook(edition: EditionSlug, slug: string): Promise<WpBook | null> {
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
  return Array.isArray(items) ? (items[0] ?? null) : null;
}

export function httpCatalogueSource(): CatalogueSource {
  return {
    listBooks,
    getBook,
    listProducts: () => getAllStoreProducts(),
  };
}
