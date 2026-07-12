/**
 * Cœur pur de la migration des produits WooCommerce (`scripts/migrate-products.ts`,
 * plan/04-commerce.md étape 4) : appariement produit ⟷ fiche, application des
 * arbitrages humains, mapping des données `commerce`/`origin: boutique`.
 *
 * Aucune I/O ici (pas de fetch, pas de Local API, pas de conversion Lexical —
 * ça reste dans l'orchestrateur) : c'est la surface couverte par
 * `migrate-products-core.test.ts`, même découpage que
 * `catalogue-core.ts`/`catalogue-http.ts` (`src/lib/CLAUDE.md`).
 */
import { priceOf, slugFromBoutiqueLink, type WcProduct } from "../src/lib/catalogue-source.ts";
import type { EditionSlug } from "../src/lib/types.ts";
import { decodeEntities } from "./migrate-catalogue/utils.ts";

/** Fiche catalogue minimale nécessaire à l'appariement (extraite du doc Payload par l'appelant). */
export interface BookRef {
  id: number;
  slug: string;
  edition: EditionSlug | null;
  /** `buy.boutiqueUrl` tel quel — `null` si la fiche n'a jamais eu de lien boutique. */
  boutiqueUrl: string | null;
  published: boolean;
}

export type ArbitrageCategory = "lien-casse" | "double-reclamation";

/**
 * Une ligne de la table de décisions humaines (`ARBITRAGES`, en tête de
 * `migrate-products.ts`). `resolution` est le seul champ qui déclenche une
 * écriture : tant qu'il vaut `null`, l'entrée reste un TODO et le script ne
 * touche ni la fiche ni le produit concerné — défaut conservateur (« ne rien
 * casser »), la décision revient au client (plan §Arbitrages humains).
 */
export interface ArbitrageEntry {
  category: ArbitrageCategory;
  /** Slug de la fiche Payload concernée — clé d'appariement à la table (stable, indépendant du lien boutique courant). */
  bookSlug: string;
  /** Segment produit tel qu'extrait de `buy.boutiqueUrl` au moment de l'analyse (repère pour le rapport humain). */
  brokenSlug: string;
  /** Constat qui motive l'entrée (dérive de slug, coquille, double réclamation…). */
  note: string;
  /** Piste d'investigation — jamais appliquée automatiquement, affichée pour accélérer la décision. */
  candidate: string | null;
  /** Résolution retenue : slug produit à apparier à cette fiche. `null` = TODO. */
  resolution: string | null;
}

export interface MatchedPair {
  book: BookRef;
  product: WcProduct;
}

export interface MatchResult {
  /** Appariements retenus — prêts pour l'écriture `commerce.sellable`/`prix`. */
  matched: MatchedPair[];
  /** Entrées d'arbitrage encore sans résolution — rapportées, rien n'est écrit. */
  pendingArbitrage: ArbitrageEntry[];
  /** Entrées arbitrées dont la résolution ne correspond à aucun produit courant (slug erroné ou produit disparu). */
  invalidResolutions: ArbitrageEntry[];
  /**
   * Conflit détecté a posteriori : un même produit réclamé par plusieurs
   * fiches sans que la table d'arbitrage n'ait tranché — anomalie non prévue
   * (garde-fou), jamais écrite automatiquement.
   */
  unexpectedDuplicates: { productSlug: string; bookSlugs: string[] }[];
  /** Produits jamais réclamés (ni match direct, ni arbitrage encore ouvert) → candidats à la création `origin: boutique`. */
  orphans: WcProduct[];
}

/**
 * Apparie chaque fiche à son produit boutique par slug (`slugFromBoutiqueLink`,
 * même clé que la fusion du front, `catalogue-core.ts`), en laissant la table
 * d'arbitrage trancher pour les fiches qu'elle couvre — ces fiches ne passent
 * JAMAIS par l'appariement « normal », qu'un lien mort recalculé coïncide ou
 * non avec autre chose.
 */
export function matchProducts(
  books: BookRef[],
  products: WcProduct[],
  arbitrages: ArbitrageEntry[],
): MatchResult {
  const productBySlug = new Map(products.map((p) => [p.slug, p]));
  const arbitrageByBookSlug = new Map(arbitrages.map((a) => [a.bookSlug, a]));

  const pendingArbitrage: ArbitrageEntry[] = [];
  const invalidResolutions: ArbitrageEntry[] = [];
  const candidates: MatchedPair[] = [];

  for (const book of books) {
    const arbitrage = arbitrageByBookSlug.get(book.slug);
    if (arbitrage) {
      if (arbitrage.resolution == null) {
        pendingArbitrage.push(arbitrage);
      } else {
        const product = productBySlug.get(arbitrage.resolution);
        if (product) candidates.push({ book, product });
        else invalidResolutions.push(arbitrage);
      }
      continue;
    }

    const raw = slugFromBoutiqueLink(book.boutiqueUrl);
    const product = raw ? productBySlug.get(raw) : undefined;
    if (product) candidates.push({ book, product });
  }

  // Détection de conflit a posteriori, tous chemins confondus (appariement
  // direct + arbitrages résolus) : une résolution humaine mal saisie (deux
  // fiches pointées vers le même slug produit) doit échouer aussi silencieusement
  // qu'une coïncidence de lien mort — jamais une écriture à l'aveugle.
  const bySlug = new Map<string, MatchedPair[]>();
  for (const c of candidates) {
    const arr = bySlug.get(c.product.slug) ?? [];
    arr.push(c);
    bySlug.set(c.product.slug, arr);
  }
  const matched: MatchedPair[] = [];
  const unexpectedDuplicates: MatchResult["unexpectedDuplicates"] = [];
  for (const [slug, arr] of bySlug) {
    if (arr.length === 1) matched.push(arr[0]);
    else unexpectedDuplicates.push({ productSlug: slug, bookSlugs: arr.map((c) => c.book.slug) });
  }

  // Produits réservés (jamais auto-créés en orphelins) : déjà appariés, OU
  // référencés — comme lien partagé réel ou comme piste candidate — par une
  // entrée d'arbitrage encore ouverte. Sans cette réserve, un produit disputé
  // entre deux éditions (ex. « Pensée et langage ») se retrouverait dupliqué
  // en fiche `origin: boutique` avant même que le client ait tranché.
  const reserved = new Set<string>(matched.map((m) => m.product.slug));
  for (const a of arbitrages) {
    if (productBySlug.has(a.brokenSlug)) reserved.add(a.brokenSlug);
    if (a.candidate && productBySlug.has(a.candidate)) reserved.add(a.candidate);
  }
  // Un conflit a posteriori (cf. ci-dessus) est aussi une réserve : un produit
  // disputé par une anomalie non prévue ne doit pas, en plus, se retrouver
  // dupliqué en fiche `origin: boutique` — il attend une table d'arbitrage
  // au même titre qu'un lien cassé connu.
  for (const d of unexpectedDuplicates) reserved.add(d.productSlug);
  const orphans = products.filter((p) => !reserved.has(p.slug));

  return { matched, pendingArbitrage, invalidResolutions, unexpectedDuplicates, orphans };
}

/** Titre WooCommerce (souvent `<i>…</i>` + entités HTML) → texte nu, même traitement que les fiches catalogue. */
export function cleanProductTitle(rawName: string): string {
  return decodeEntities(rawName.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Données `commerce`/`prix` à écrire sur une fiche déjà matchée — jamais `stock` (routeur/saisie manuelle ensuite, cf. mission). */
export interface MatchedBookUpdate {
  prix: number | null;
  sellable: true;
}

export function matchedBookUpdate(product: WcProduct): MatchedBookUpdate {
  return { prix: priceOf(product), sellable: true };
}

/**
 * Les produits boutique-seuls (goodies, manuels…) n'ont pas de vraie « date de
 * parution » — le champ est pourtant `required` côté schéma `Books`. Sentinelle
 * STABLE (jamais `new Date()`, qui casserait l'idempotence d'un run à l'autre
 * et polluerait le tri « nouveautés » du catalogue fusionné en faisant
 * remonter ces articles au sommet) plutôt qu'une vraie date, absente de la
 * Store API publique (pas de `date_created` exposé).
 */
export const ORPHAN_DATE_PARUTION = "2000-01-01T00:00:00.000Z";

/** Données d'une fiche `origin: boutique` créée pour un produit sans fiche catalogue — hors `presentation` (Lexical, construit par l'orchestrateur). */
export interface OrphanBookData {
  title: string;
  slug: string;
  edition: null;
  origin: "boutique";
  isbn: null;
  prix: number | null;
  dateParution: string;
  /** Idem `dateParution` : requis par le schéma, sans defaultValue exploitable via la Local API typée — même sentinelle stable. */
  sortDate: string;
  aParaitre: false;
  authors: number[];
  collection: null;
  coverFallbackUrl: string | null;
  commerce: { sellable: true };
}

export function orphanBookData(product: WcProduct): OrphanBookData {
  return {
    title: cleanProductTitle(product.name),
    slug: product.slug,
    edition: null,
    origin: "boutique",
    isbn: null,
    prix: priceOf(product),
    dateParution: ORPHAN_DATE_PARUTION,
    sortDate: ORPHAN_DATE_PARUTION,
    aParaitre: false,
    authors: [],
    collection: null,
    coverFallbackUrl: product.images?.[0]?.src ?? null,
    commerce: { sellable: true },
  };
}
