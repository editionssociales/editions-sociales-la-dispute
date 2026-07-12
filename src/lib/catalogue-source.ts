import type { Cover, EditionSlug, Term } from "./types";

/**
 * Port du catalogue + formes brutes neutres.
 *
 * Ce module ne fait **pas** d'I/O : il décrit l'interface `CatalogueSource`
 * (livres bruts des deux fonds + produits boutique) et les shapes que le port
 * transporte. La forme livre (`RawBook`) est **neutre** : chaque adaptateur —
 * http (`catalogue-http.ts` via `catalogue-wp-map.ts`), pg
 * (`catalogue-pg.ts` via `catalogue-pg-map.ts`), mémoire (tests, ci-dessous)
 * — a déjà absorbé son dialecte (entités WP, chaînes ACF sales, enveloppe
 * Payload) avant la couture. Toute la fusion / filtre / facette / tri vit en
 * aval dans `catalogue-core.ts`. L'interface cesse ainsi d'être « le réseau »
 * — et cesse aussi d'être « WordPress ».
 */

/* -------- Forme brute neutre d'une fiche livre -------- */

/**
 * Fiche livre telle que le port la transporte : données propres, prêtes pour
 * la fusion. Le cœur n'y applique plus que le travail indépendant de la
 * source (orthotypo du titre, résolution d'achat, `sanitizeCms` des HTML).
 */
export interface RawBook {
  id: number;
  slug: string;
  /** Titre en texte nu — entités décodées par l'adaptateur ; l'orthotypo s'applique en aval. */
  title: string;
  /** Auteurs en forme d'affichage (`Prénom Nom`). */
  authors: Term[];
  collection: Term | null;
  isbn: string | null;
  /** Prix en euros — déjà parsé (les chaînes sales ACF sont un dialecte WP). */
  price: number | null;
  pages: number | null;
  /** Parution ISO `YYYY-MM-DD`. */
  publishedAt: string | null;
  /** Couverture prête à rendre (https, rebase cms-* déjà appliqué côté WP). */
  cover: Cover | null;
  buy: {
    boutique: string | null;
    parislibrairies: string | null;
    lalibrairie: string | null;
  };
  /** HTML de présentation — servi par `getBook` (les listes l'omettent), sanitisé en aval. */
  presentationHtml: string | null;
  /** « Pour aller plus loin » (HTML), sanitisé en aval. */
  furtherReadingHtml: string | null;
  /** Table des matières (PDF), URL prête à l'emploi. */
  tocUrl: string | null;
  /** Extrait choisi (PDF), URL prête à l'emploi. */
  excerptUrl: string | null;
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
  listBooks(edition: EditionSlug): Promise<RawBook[]>;
  /** Fiche brute d'un livre (avec `presentationHtml`), ou `null` si absente. */
  getBook(edition: EditionSlug, slug: string): Promise<RawBook | null>;
  /** Tous les produits boutique bruts. */
  listProducts(): Promise<WcProduct[]>;
}

/* -------- Adaptateur en mémoire (tests) -------- */

export interface CatalogueFixture {
  books: Partial<Record<EditionSlug, RawBook[]>>;
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
