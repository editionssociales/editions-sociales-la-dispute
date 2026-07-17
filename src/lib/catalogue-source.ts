import type { Cover, EditionSlug, Term } from "./types";

/**
 * Port du catalogue + formes brutes neutres.
 *
 * Ce module ne fait **pas** d'I/O : il décrit l'interface `CatalogueSource`
 * (livres bruts des deux fonds) et les shapes que le port transporte. La
 * forme livre (`RawBook`) est **neutre** : chaque adaptateur —
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
  /**
   * Données de vente natives (Payload, groupe `commerce` des `books`) —
   * `null`/absent pour l'adaptateur http (WordPress ne connaît ni `sellable`
   * ni `stock`) ; lues uniquement à `COMMERCE_NATIVE=1`
   * (`catalogue-core.ts:resolveNativePurchase`). Optionnel pour ne pas
   * casser les fixtures `RawBook` existantes qui n'en ont pas besoin.
   */
  commerce?: CommerceInfo | null;
}

/** Ce que le commerce natif connaît de la vente d'un livre (Payload uniquement). */
export interface CommerceInfo {
  /** Coché = éligible au panier natif — cf. `Books.ts:commerce.sellable`. */
  sellable: boolean;
  /** `null` = non suivi = disponible (jamais un plancher qui bloque la vente) ; sinon 0 = épuisé. */
  stock: number | null;
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

/**
 * Extrait le slug produit d'un lien boutique ACF (`…/produit/<slug>/`).
 * Décode l'URL (slug encodé) et le motif s'arrête sur `?`/`#` : un lien
 * boutique malformé (query string, fragment) ne produit plus un slug pollué
 * — version durcie, désormais la seule (reprise de la version défensive que
 * `scripts/migrate-catalogue/sql-oracle.ts` recopiait localement).
 */
export function slugFromBoutiqueLink(link: string | null): string | null {
  if (!link) return null;
  let decoded = link;
  try {
    decoded = decodeURIComponent(link);
  } catch {
    // URL déjà décodée ou séquence invalide : on retente sur le brut.
  }
  const m = /\/produit\/([^/?#]+)\/?/.exec(decoded);
  return m?.[1] ?? null;
}

/* -------- Where « books lisibles publiquement » (pg) --------
 *
 * Seule concession Payload de ce module autrement neutre (http/pg/mémoire) :
 * la forme du `where` par fonds, partagée entre l'adaptateur pg
 * (`catalogue-pg.ts:listBooks`/`getBook`) et la preuve de parité
 * (`scripts/compare-sources.ts:pgBooksForEdition`) — les deux lectures qui
 * doivent voir EXACTEMENT le même sous-ensemble de la collection `books`.
 * Ce constructeur ne fixe que le filtre `edition` ; le filtre de statut
 * (« publié ») n'est pas dans le `where` lui-même mais vient de la policy
 * `read` de `Books.ts` (`_status: { equals: 'published' }` pour un visiteur
 * anonyme), appliquée dès lors que l'appelant pose `overrideAccess: false` —
 * omis (donc `true` par défaut côté Local API), la policy ne joue plus et des
 * brouillons fuitent (c'était le bug de `compare-sources.ts` avant ce
 * changement : sa preuve de parité « 0 diff bloquant » laissait passer des
 * fiches jamais publiées).
 */

/** Forme du `where` « livres d'un fonds lisibles publiquement » (Payload) — cf. note ci-dessus. */
export function publicBooksWhere(edition: EditionSlug): { edition: { equals: EditionSlug } } {
  return { edition: { equals: edition } };
}

/**
 * Options de lecture « publique » de la collection `books` — l'autre moitié,
 * indissociable, du contrat anti-brouillon : `draft: false` ne fait que
 * choisir la branche de requête (pas de `queryDrafts()`), c'est
 * `overrideAccess: false` qui fait jouer la policy `read` de `Books.ts`
 * (`_status: 'published'` pour un anonyme). Défini UNE fois ici, étalé dans
 * chaque `payload.find` public (`catalogue-pg.ts`, `compare-sources.ts`) —
 * verrouillé par `catalogue-pg.test.ts`.
 */
export const PUBLIC_BOOKS_READ = { draft: false, overrideAccess: false } as const;

/* -------- Le port --------
 *
 * Ne transporte plus les produits boutique : l'axe vente legacy (Store API
 * WooCommerce) vit entièrement dans `boutique.ts` (`getAllStoreProducts`),
 * appelé directement par la façade (`catalogue.ts`) — un port à adaptateur
 * unique (http et pg délèguent tous deux, à l'identique, à la même fonction)
 * n'ajoutait pas de profondeur. Supprimable à la clôture (plan/07 étape 7),
 * avec le reste de l'axe Woo.
 */

export interface CatalogueSource {
  /** Toutes les fiches livre brutes d'un fonds (résilient : liste partielle si une page échoue). */
  listBooks(edition: EditionSlug): Promise<RawBook[]>;
  /** Fiche brute d'un livre (avec `presentationHtml`), ou `null` si absente. */
  getBook(edition: EditionSlug, slug: string): Promise<RawBook | null>;
}

/* -------- Adaptateur en mémoire (tests) -------- */

export interface CatalogueFixture {
  books: Partial<Record<EditionSlug, RawBook[]>>;
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
  };
}
