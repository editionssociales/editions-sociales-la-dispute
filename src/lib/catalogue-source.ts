import type { EditionSlug, Term } from "./types";

/**
 * Port du catalogue + formes brutes des fournisseurs.
 *
 * Ce module ne fait **pas** d'I/O : il décrit l'interface `CatalogueSource`
 * (livres bruts des deux fonds + produits boutique) et les shapes JSON
 * renvoyées par WordPress REST / WooCommerce Store API. Un adaptateur http
 * (prod, `catalogue-http.ts`) et un adaptateur en mémoire (tests, ci-dessous)
 * l'implémentent ; toute la fusion / filtre / facette / tri vit en aval dans
 * `catalogue-core.ts`. L'interface cesse ainsi d'être « le réseau ».
 */

/* -------- Formes brutes WordPress REST (CPT `catalogue` + ACF réexposés) -------- */

export interface WpCoverField {
  url: string;
  width: number;
  height: number;
}
export interface WpBookField {
  isbn?: string | null;
  prix?: string | number | null;
  pages?: string | number | null;
  date_parution?: string | null;
  plus_loin?: string | null;
  table?: string | null;
  extrait?: string | null;
  boutique?: string | null;
  parislibrairies?: string | null;
  lalibrairie?: string | null;
  authors?: Term[];
  collection?: Term | null;
  /** Ancienne forme (string) tolérée pendant le déploiement du mu-plugin. */
  cover?: WpCoverField | string | null;
}
export interface WpBook {
  id: number;
  slug: string;
  title: { rendered: string };
  content?: { rendered: string };
  book?: WpBookField;
}

/* -------- Forme brute WooCommerce Store API -------- */

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

/** Prix d'un produit boutique en unités majeures (€), depuis le mineur Store API. */
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

/* -------- Le port -------- */

export interface CatalogueSource {
  /** Toutes les fiches livre brutes d'un fonds (résilient : liste partielle si une page échoue). */
  listBooks(edition: EditionSlug): Promise<WpBook[]>;
  /** Fiche brute d'un livre (avec `content`), ou `null` si absente. */
  getBook(edition: EditionSlug, slug: string): Promise<WpBook | null>;
  /** Tous les produits boutique bruts. */
  listProducts(): Promise<WcProduct[]>;
}

/* -------- Adaptateur en mémoire (tests) -------- */

export interface CatalogueFixture {
  books: Partial<Record<EditionSlug, WpBook[]>>;
  products?: WcProduct[];
}

/**
 * Implémentation du port alimentée par des fixtures — l'adaptateur de test qui
 * fait de l'interface une vraie couture : la logique de `catalogue-core` se
 * teste à travers elle, sans réseau.
 */
export function inMemoryCatalogueSource(fixture: CatalogueFixture): CatalogueSource {
  return {
    async listBooks(edition) {
      return fixture.books[edition] ?? [];
    },
    async getBook(edition, slug) {
      return (fixture.books[edition] ?? []).find((b) => b.slug === slug) ?? null;
    },
    async listProducts() {
      return fixture.products ?? [];
    },
  };
}
