import "server-only";
import { cache } from "react";

/**
 * Accès à la **WooCommerce Store API** (`/wp-json/wc/store/v1/…`), publique et
 * sans clé. Utilisé uniquement par `catalogue.ts` pour fusionner chaque livre
 * avec son produit boutique (prix, disponibilité, lien d'achat) — la boutique
 * n'est plus une section séparée, elle enrichit le catalogue unifié.
 */

const WC = process.env.WC_STORE_URL || "https://boutique.editionssociales.fr";
const REVALIDATE = Number(process.env.WP_REVALIDATE ?? "3600");

export interface WcProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  is_purchasable: boolean;
  is_in_stock: boolean;
  prices?: { price: string; currency_minor_unit: number };
  images?: { src: string }[];
}

export function priceOf(p: WcProduct): number | null {
  const minor = p.prices?.currency_minor_unit ?? 2;
  const raw = p.prices?.price != null ? Number(p.prices.price) : NaN;
  return Number.isFinite(raw) ? raw / 10 ** minor : null;
}

/** Extrait le slug produit d'un lien boutique ACF (`…/produit/<slug>/`). */
export function slugFromBoutiqueLink(link: string | null): string | null {
  if (!link) return null;
  const m = /\/produit\/([^/]+)\/?/.exec(link);
  return m?.[1] ?? null;
}

/** Récupère l'intégralité des produits de la boutique (pagination interne). */
export const getAllStoreProducts = cache(async (): Promise<WcProduct[]> => {
  const perPage = 100;
  const out: WcProduct[] = [];
  for (let page = 1; page <= 10; page++) {
    let items: WcProduct[];
    try {
      const res = await fetch(
        `${WC}/wp-json/wc/store/v1/products?per_page=${perPage}&page=${page}&orderby=date&order=desc`,
        { next: { revalidate: REVALIDATE }, headers: { Accept: "application/json" } },
      );
      if (!res.ok) break;
      items = (await res.json()) as WcProduct[];
    } catch (err) {
      if (page === 1) console.error("[boutique] Store API indisponible:", err);
      break;
    }
    out.push(...items);
    if (items.length < perPage) break;
  }
  return out;
});
