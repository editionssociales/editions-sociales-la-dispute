import "server-only";
import { cache } from "react";
import type { WcProduct } from "./catalogue-source";

/**
 * Transport de la **WooCommerce Store API** (`/wp-json/wc/store/v1/…`), publique
 * et sans clé. Adaptateur bas niveau utilisé par `catalogue-http.ts` pour
 * fusionner chaque livre avec son produit boutique (prix, disponibilité, lien
 * d'achat) — la boutique n'est plus une section séparée, elle enrichit le
 * catalogue unifié. Les shapes + helpers purs vivent dans `catalogue-source.ts`.
 */

const WC = process.env.WC_STORE_URL || "https://boutique.editionssociales.fr";
const REVALIDATE = Number(process.env.WP_REVALIDATE ?? "3600");

/** Récupère l'intégralité des produits de la boutique (pagination interne, résilient). */
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
      // Réponse 200 mais corps non-liste (erreur WP sérialisée, cache/proxy) :
      // on dégrade en catalogue sans produits plutôt que de planter la page.
      if (!Array.isArray(items)) break;
    } catch (err) {
      if (page === 1) console.error("[boutique] Store API indisponible:", err);
      break;
    }
    out.push(...items);
    if (items.length < perPage) break;
  }
  return out;
});
