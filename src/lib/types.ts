/**
 * Modèle de domaine pour le site des Éditions sociales x La Dispute.
 *
 * Le catalogue et la boutique sont fusionnés en une seule liste de `Book` :
 * un livre peut être achetable en ligne (produit boutique résolu), disponible
 * ailleurs (liens vers d'autres librairies), à paraître, ou indisponible en
 * ligne — mais il reste toujours visible dans le même catalogue.
 */
import type { SafeHtml } from "./cms-html";

/** Clé technique d'une source de données (base OVH). */
export type SourceKey = "es" | "ld" | "boutique";

/** Les deux fonds historiques réunis dans la maison. */
export type EditionSlug = "editions-sociales" | "la-dispute";

/** Un terme de taxonomie (auteur, libellé). */
export interface Term {
  name: string;
  slug: string;
}

/** Une facette de filtrage avec son nombre d'occurrences. */
export interface Facet extends Term {
  count: number;
}

/** Couverture avec ses dimensions réelles (pour un rendu sans recadrage). */
export interface Cover {
  url: string;
  width: number;
  height: number;
}

/** Liens d'achat externes d'un livre (autres librairies). */
export interface BuyLinks {
  boutique: string | null;
  parislibrairies: string | null;
  lalibrairie: string | null;
}

/** Statut d'achat résolu d'un livre. */
export type PurchaseStatus = "available" | "external" | "upcoming" | "unavailable";

/**
 * Comment le bouton d'achat principal doit se comporter : `cart` (panier
 * natif — `status === "available"`) ou `legacy-link` (lien externe — librairie
 * tierce type Paris Librairies / La Librairie).
 */
export type PurchaseMode = "cart" | "legacy-link";

/** Un livre du catalogue unifié (vue liste). */
export interface Book {
  id: number;
  /** `null` pour un article boutique sans fiche catalogue d'origine. */
  edition: EditionSlug | null;
  origin: "catalogue" | "boutique";
  slug: string;
  title: string;
  authors: Term[];
  /** Libellés thématiques (0..n) — remplacent l'ancienne collection unique. */
  libelles: Term[];
  isbn: string | null;
  /** Prix affiché : celui de la boutique si résolu, sinon le prix catalogue. */
  price: number | null;
  pages: number | null;
  /** Date de parution normalisée en ISO `YYYY-MM-DD`. */
  publishedAt: string | null;
  cover: Cover | null;
  buy: BuyLinks;
  status: PurchaseStatus;
  /** Destination du bouton d'achat principal (produit boutique ou lien externe). */
  permalink: string | null;
  /**
   * Mode d'achat — toujours posé par les builders (`toBook`, `bookFromProduct`,
   * `resolveNativePurchase`) ; optionnel seulement pour ne pas casser les
   * fixtures minimales existantes qui construisent un `Book` à la main
   * (`browse.test.ts`) sans passer par ces builders.
   */
  purchaseMode?: PurchaseMode;
}

/** Un livre avec ses champs de détail (fiche). */
export interface BookDetail extends Book {
  /** Présentation (HTML nettoyé, ex-`post_content`). */
  presentation: SafeHtml;
  /** « Pour aller plus loin » (HTML nettoyé, champ ACF `plus_loin`). */
  furtherReading: SafeHtml | null;
  /** Table des matières (PDF). */
  tocUrl: string | null;
  /** Extrait choisi (PDF). */
  excerptUrl: string | null;
}

/** Filtres appliqués au catalogue. */
export interface BookFilters {
  edition?: EditionSlug;
  /** Slug d'un libellé thématique (`?libelle=`). */
  libelle?: string;
  author?: string;
  q?: string;
  sort?: BookSort;
  page?: number;
  /** Ne garder que les livres à paraître (cible du bloc « À paraître » de la navbar). */
  upcoming?: boolean;
}

/**
 * LA liste des tris — le type en dérive, les validations serveur/client et
 * le `<select>` la consomment.
 */
export const BOOK_SORTS = ["recent", "ancien", "titre"] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

export const PAGE_SIZE = 24;
