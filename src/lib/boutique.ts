import "server-only";
import { cache } from "react";
import type { WcProduct } from "./catalogue-source";
import { fetchAllPages } from "./fetch-all-pages";

/**
 * Transport de la **WooCommerce Store API** (`/wp-json/wc/store/v1/…`), publique
 * et sans clé. Adaptateur bas niveau utilisé par `catalogue-http.ts` pour
 * fusionner chaque livre avec son produit boutique (prix, disponibilité, lien
 * d'achat) — la boutique n'est plus une section séparée, elle enrichit le
 * catalogue unifié. Les shapes + helpers purs vivent dans `catalogue-source.ts`.
 */

const WC = process.env.WC_STORE_URL || "https://boutique.editionssociales.fr";
const REVALIDATE = Number(process.env.WP_REVALIDATE ?? "3600");

/** Récupère l'intégralité des produits de la boutique (pagination `fetch-all-pages`, résilient). */
export const getAllStoreProducts = cache(async (): Promise<WcProduct[]> => {
  const perPage = 100;
  return fetchAllPages<WcProduct>({
    perPage,
    maxPages: 10,
    fetchPage: async (page) => {
      const res = await fetch(
        `${WC}/wp-json/wc/store/v1/products?per_page=${perPage}&page=${page}&orderby=date&order=desc`,
        { next: { revalidate: REVALIDATE }, headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`Store API products page ${page} → ${res.status}`);
      return res.json();
    },
    onPageError: (err, page) => {
      if (page === 1) console.error("[boutique] Store API indisponible:", err);
    },
  });
});
