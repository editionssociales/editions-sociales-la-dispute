import "server-only";
import { cache } from "react";
import { decodeEntities } from "./format";
import type { Product } from "./types";

/**
 * Repository de la boutique — mode headless via la **WooCommerce Store API**
 * (`/wp-json/wc/store/v1/…`), publique et sans clé.
 *
 * Le panier et le paiement (Stripe, déjà configuré côté WooCommerce) restent
 * gérés par la boutique existante : chaque produit renvoie vers son `permalink`
 * (add-to-cart / checkout WooCommerce). La bascule éventuelle vers un paiement
 * Stripe natif sera tranchée avec le client (étape 2).
 */

const WC = process.env.WC_STORE_URL || "https://boutique.editionssociales.fr";
const REVALIDATE = Number(process.env.WP_REVALIDATE ?? "3600");

interface WcProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  sku: string;
  prices?: { price: string; currency_minor_unit: number };
  images?: { src: string }[];
}

function wcGet(path: string): Promise<Response> {
  return fetch(`${WC}/wp-json/wc/store/v1/${path}`, {
    next: { revalidate: REVALIDATE },
    headers: { Accept: "application/json" },
  });
}

function mapProduct(p: WcProduct): Product {
  const minor = p.prices?.currency_minor_unit ?? 2;
  const raw = p.prices?.price != null ? Number(p.prices.price) : NaN;
  const price = Number.isFinite(raw) ? raw / 10 ** minor : null;
  return {
    id: p.id,
    slug: p.slug,
    title: decodeEntities(p.name ?? ""),
    price,
    sku: p.sku || null,
    imageUrl: p.images?.[0]?.src ?? null,
    permalink: p.permalink,
  };
}

export const getProducts = cache(async (limit = 48): Promise<Product[]> => {
  const cap = Math.max(1, Math.min(100, Math.floor(limit)));
  try {
    const res = await wcGet(`products?per_page=${cap}&orderby=date&order=desc`);
    if (!res.ok) {
      console.error(`[boutique] Store API → ${res.status}`);
      return [];
    }
    const data = (await res.json()) as WcProduct[];
    return data.map(mapProduct);
  } catch (err) {
    console.error("[boutique] Store API indisponible:", err);
    return [];
  }
});

export async function countProducts(): Promise<number> {
  try {
    const res = await wcGet("products?per_page=1");
    const total = res.headers.get("x-wp-total");
    return total ? Number(total) : 0;
  } catch {
    return 0;
  }
}
