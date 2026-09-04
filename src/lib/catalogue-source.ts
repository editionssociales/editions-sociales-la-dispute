import type { Cover, EditionSlug, PressQuote, Term } from "./types";

/**
 * Port du catalogue + formes brutes neutres.
 *
 * Ce module ne fait **pas** d'I/O : il décrit l'interface `CatalogueSource`
 * (livres bruts des deux fonds) et les shapes que le port transporte. La
 * forme livre (`RawBook`) est **neutre** : chaque adaptateur — pg
 * (`catalogue-pg.ts` via `catalogue-pg-map.ts`), mémoire (tests, ci-dessous)
 * — a déjà absorbé son dialecte (enveloppe Payload) avant la couture. Tout
 * l'assemblage / filtre / facette / tri vit en aval dans `catalogue-core.ts`.
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
  libelles: Term[];
  isbn: string | null;
  /** Prix en euros — déjà parsé par l'adaptateur. */
  price: number | null;
  pages: number | null;
  /** Parution ISO `YYYY-MM-DD`. */
  publishedAt: string | null;
  /** Couverture prête à rendre (URL https — Media Payload/Blob). */
  cover: Cover | null;
  buy: {
    boutique: string | null;
    parislibrairies: string | null;
    lalibrairie: string | null;
  };
  /** HTML de présentation, sanitisé en aval — toujours peuplé (`listBooks`/`getBook` font tous deux `depth: 2`, aucun champ omis). */
  presentationHtml: string | null;
  /** « Pour aller plus loin » (HTML), sanitisé en aval. */
  furtherReadingHtml: string | null;
  /** Table des matières (PDF), URL prête à l'emploi. */
  tocUrl: string | null;
  /** Extrait choisi (PDF), URL prête à l'emploi. */
  excerptUrl: string | null;
  /**
   * Onglets de la fiche (maquette 2026-07-23) : citations presse, URL
   * YouTube, table des matières en HTML (sanitisée en aval). Optionnels —
   * même raison que `commerce` : ne pas casser les fixtures minimales.
   */
  press?: PressQuote[];
  videoUrl?: string | null;
  tocHtml?: string | null;
  /**
   * Données de vente (Payload, groupe `commerce` des `books`) — absent sur
   * une fixture minimale : `NO_COMMERCE` (jamais vendable) s'applique alors
   * (`catalogue-core.ts:resolveNativePurchase`). Optionnel pour ne pas
   * casser les fixtures `RawBook` existantes qui n'en ont pas besoin.
   */
  commerce?: CommerceInfo | null;
}

/** Ce que le moteur de commerce connaît de la vente d'un livre. */
export interface CommerceInfo {
  /** Coché = éligible au panier natif — cf. `Books.ts:commerce.sellable`. */
  sellable: boolean;
  /**
   * `null` = stock non renseigné → indisponible à la commande (refus
   * `untracked`, `sellability.ts`), sauf à paraître + précommande ouverte ;
   * `0` = épuisé ; `> 0` = commandable.
   */
  stock: number | null;
  /**
   * Coché = « Ouvert à la précommande » (`Books.ts:commerce.preorder`,
   * client 2026-08-20) — lève le refus `upcoming` de `assessSellability`
   * pour cette fiche. Optionnel : absent (fixtures existantes, adaptateur pg
   * avant migration) = `false`, comportement historique inchangé.
   */
  preorder?: boolean;
}

/* -------- Where « books lisibles publiquement » (pg) --------
 *
 * Seule concession Payload de ce module autrement neutre (pg/mémoire) : la
 * forme du `where` par fonds, utilisée par l'adaptateur pg
 * (`catalogue-pg.ts:listBooks`/`getBook`). Ce constructeur ne fixe que le
 * filtre `edition` ; le filtre de statut (« publié ») n'est pas dans le
 * `where` lui-même mais vient de la policy `read` de `Books.ts`
 * (`_status: { equals: 'published' }` pour un visiteur anonyme), appliquée
 * dès lors que l'appelant pose `overrideAccess: false` — omis (donc `true`
 * par défaut côté Local API), la policy ne joue plus et des brouillons
 * fuitent.
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
 * chaque `payload.find` public (`catalogue-pg.ts`, `commerce-source.ts`) —
 * verrouillé par `catalogue-pg.test.ts` et `commerce-source.test.ts`.
 */
export const PUBLIC_BOOKS_READ = { draft: false, overrideAccess: false } as const;

/* -------- Le port -------- */

export interface CatalogueSource {
  /** Toutes les fiches livre brutes d'un fonds. */
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
