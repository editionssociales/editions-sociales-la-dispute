/**
 * Modèle de domaine unifié pour le site des Éditions sociales / La Dispute.
 *
 * Ces types représentent la *fusion* des deux catalogues WordPress historiques
 * (CPT `catalogue` + champs ACF) et de la boutique WooCommerce, exposés sous une
 * forme propre et indépendante de WordPress.
 */

/** Clé technique d'une source de données (base OVH). */
export type SourceKey = "es" | "ld" | "boutique";

/** Les deux maisons d'édition réunies dans la structure unique. */
export type EditionSlug = "editions-sociales" | "la-dispute";

/** Un terme de taxonomie (auteur, collection). */
export interface Term {
  name: string;
  slug: string;
}

/** Une facette de filtrage avec son nombre d'occurrences. */
export interface Facet extends Term {
  count: number;
}

/** Un livre du catalogue (vue liste). */
export interface Book {
  id: number;
  edition: EditionSlug;
  slug: string;
  title: string;
  authors: Term[];
  collection: Term | null;
  isbn: string | null;
  price: number | null;
  pages: number | null;
  /** Date de parution normalisée en ISO `YYYY-MM-DD`. */
  publishedAt: string | null;
  coverUrl: string | null;
  buy: BuyLinks;
}

/** Liens d'achat d'un livre. */
export interface BuyLinks {
  boutique: string | null;
  parislibrairies: string | null;
  lalibrairie: string | null;
}

/** Un livre avec ses champs de détail (fiche). */
export interface BookDetail extends Book {
  /** Présentation (HTML, ex-`post_content`). */
  presentation: string;
  /** « Pour aller plus loin » (HTML, champ ACF `plus_loin`). */
  furtherReading: string | null;
  /** Table des matières (PDF). */
  tocUrl: string | null;
  /** Extrait choisi (PDF). */
  excerptUrl: string | null;
}

/** Filtres appliqués au catalogue. */
export interface BookFilters {
  edition?: EditionSlug;
  collection?: string;
  author?: string;
  q?: string;
  sort?: BookSort;
}

export type BookSort = "recent" | "ancien" | "titre";

/** Un produit de la boutique (WooCommerce). */
export interface Product {
  id: number;
  slug: string;
  title: string;
  price: number | null;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
}
