/**
 * Cœur pur du panier client (plan §4, phase 4/lot 2, étape 6) — sans I/O ni
 * rendu, comme `shipping-core.ts`/`campaign.ts` : c'est la surface couverte
 * par `cart-core.test.ts`. Trois responsabilités :
 *
 *  1. L'état persisté (`CartState`) et son reducer pur — quantités par livre,
 *     JAMAIS de prix (le prix affiché vient toujours d'une relecture serveur
 *     fraîche, `Book.price`, au moment du rendu de `/panier` — ce module ne
 *     fait que compter des exemplaires).
 *  2. Le (dé)sérialiseur `localStorage`, défensif : toute entrée malformée
 *     (JSON invalide, version inconnue, ligne corrompue) retombe sur un
 *     panier vide plutôt que de jeter — un `localStorage` est une entrée
 *     utilisateur non fiable au même titre qu'un `FormData`.
 *  3. La résolution d'une ligne de panier contre un instantané `Book[]`
 *     (fraîchement lu, plan §4 étape 11) en lignes affichables + totaux —
 *     composée ensuite avec `computeShipping` (`shipping-core.ts`) par
 *     l'appelant (`/panier`), ce module ignore tout des zones/coupons.
 *
 * Identifiant de ligne : `Book.id` (clé Postgres du document `books`,
 * globalement unique — une seule collection pour les deux fonds ET la
 * boutique-seule), PAS `slug` : `Books.ts` ne garantit l'unicité du slug que
 * PAR ESPACE (`(edition, slug)`, cf. son index composite) — deux fonds
 * pourraient légitimement partager un slug. `id` est la seule clé sûre pour
 * distinguer sans ambiguïté deux lignes.
 */
import { eurosToCents } from "./money";
import { isManifestOnly } from "./shipping-core";
import type { Book, Cover, EditionSlug } from "./types";

/** Version du format persisté — toute valeur différente (ou absente) invalide le panier stocké. */
export const CART_VERSION = 1;

export interface CartLine {
  id: number;
  qty: number;
}

export interface CartState {
  version: typeof CART_VERSION;
  lines: CartLine[];
}

export const EMPTY_CART: CartState = { version: CART_VERSION, lines: [] };

/**
 * Plafond défensif par ligne — même esprit que `FREE_AMOUNT` de
 * `donation-tiers.ts` : borne un `localStorage` trafiqué ou une frappe
 * malheureuse (`qty: 9999`), jamais une vraie limite produit.
 */
export const MAX_LINE_QTY = 20;

function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.min(MAX_LINE_QTY, Math.max(1, Math.round(qty)));
}

/* --------------------------------- reducer --------------------------------- */

/** Ajoute `qty` exemplaires (1 par défaut) d'un livre — cumule si la ligne existe déjà. */
export function addToCart(state: CartState, id: number, qty = 1): CartState {
  const existing = state.lines.find((l) => l.id === id);
  if (existing) {
    return {
      ...state,
      lines: state.lines.map((l) => (l.id === id ? { ...l, qty: clampQty(l.qty + qty) } : l)),
    };
  }
  return { ...state, lines: [...state.lines, { id, qty: clampQty(qty) }] };
}

/** Fixe la quantité exacte d'une ligne — une quantité ≤ 0 retire la ligne (pas de ligne à 0). */
export function setLineQty(state: CartState, id: number, qty: number): CartState {
  if (qty <= 0) return removeFromCart(state, id);
  return {
    ...state,
    lines: state.lines.map((l) => (l.id === id ? { ...l, qty: clampQty(qty) } : l)),
  };
}

export function removeFromCart(state: CartState, id: number): CartState {
  return { ...state, lines: state.lines.filter((l) => l.id !== id) };
}

export function clearCart(): CartState {
  return { version: CART_VERSION, lines: [] };
}

/** Nombre total d'exemplaires (badge du header) — somme des quantités, pas le nombre de lignes. */
export function cartCount(state: CartState): number {
  return state.lines.reduce((n, l) => n + l.qty, 0);
}

/* ------------------------------- persistance -------------------------------- */

/**
 * Reconstruit un `CartState` depuis la chaîne brute `localStorage` — ne jette
 * JAMAIS : JSON invalide, version inconnue, `lines` absent/mal formé, entrée
 * sans `id` entier positif ou sans `qty` numérique → repli sur le panier vide
 * (ou, pour une ligne isolée corrompue au sein d'un panier par ailleurs sain,
 * son seul retrait silencieux). Un `id` dupliqué (corruption manuelle) ne
 * garde que sa première occurrence.
 */
export function parseCartState(raw: string | null | undefined): CartState {
  if (!raw) return EMPTY_CART;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_CART;
  }
  if (!data || typeof data !== "object") return EMPTY_CART;
  const obj = data as Record<string, unknown>;
  if (obj.version !== CART_VERSION || !Array.isArray(obj.lines)) return EMPTY_CART;

  const seen = new Set<number>();
  const lines: CartLine[] = [];
  for (const entry of obj.lines) {
    if (!entry || typeof entry !== "object") continue;
    const { id, qty } = entry as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (typeof qty !== "number" || !Number.isFinite(qty)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    lines.push({ id, qty: clampQty(qty) });
  }
  return { version: CART_VERSION, lines };
}

export function serializeCartState(state: CartState): string {
  return JSON.stringify(state);
}

/* --------------------------- éligibilité au panier --------------------------- */

/**
 * Un livre affiche-t-il « Ajouter au panier » (`buy-links.tsx`, `book-card.tsx`) ?
 * Reflet exact de la décision de `resolveNativePurchase` (`catalogue-core.ts`) :
 * seul `purchaseMode === "cart"` (disponible à la vente native) ouvre le
 * bouton — `external`/`upcoming`/`unavailable` restent des liens/mentions.
 */
export function canAddToCart(book: Pick<Book, "status" | "purchaseMode">): boolean {
  return book.status === "available" && book.purchaseMode === "cart";
}

/* ------------------------------ lignes résolues ------------------------------ */

/** Une ligne de panier une fois confrontée à un instantané `Book[]` frais. */
export interface CartLineView {
  id: number;
  title: string;
  slug: string;
  edition: EditionSlug | null;
  origin: Book["origin"];
  cover: Cover | null;
  /** Fiche à laquelle revenir depuis `/panier`. */
  href: string;
  qty: number;
  /** `null` si le prix n'est pas connu (jamais censé arriver pour une ligne `purchasable`). */
  unitPriceCents: number | null;
  /** 0 si la ligne n'est pas `purchasable` — exclue des totaux, jamais inventée. */
  lineTotalCents: number;
  /** `false` = retiré depuis l'ajout au panier (rupture, dépublié, plus vendable) — affiché, jamais compté. */
  purchasable: boolean;
  /** Port réduit « manifeste » (`commerce.reducedShippingFlag`, fourni séparément par l'appelant). */
  reducedShippingFlag: boolean;
}

export interface CartSummary {
  lines: CartLineView[];
  /** Ids du panier introuvables dans l'instantané (livre supprimé/dépublié) — à faire disparaître côté appelant. */
  missingIds: number[];
  /** Somme des lignes `purchasable` uniquement, en centimes. */
  subtotalCents: number;
  /** Vrai ssi au moins une ligne `purchasable` ET toutes le sont avec `reducedShippingFlag`. */
  manifestOnly: boolean;
}

/** Extrait uniquement les livres demandés d'un instantané — pur, réutilisé par la façade serveur (`panier/actions.ts`). */
export function pickBooksByIds(books: Book[], ids: number[]): Book[] {
  const set = new Set(ids);
  return books.filter((b) => set.has(b.id));
}

/**
 * Confronte l'état persisté (ids + quantités) à un instantané `Book[]` frais
 * (relu au moment du rendu de `/panier`, jamais depuis le panier lui-même) et
 * à la carte des drapeaux de port réduit (lus séparément, cf.
 * `commerce-source.ts` — `commerce.reducedShippingFlag` n'est pas porté par
 * le type `Book`, hors périmètre de la fusion catalogue). Ne fait AUCUN calcul
 * de port/remise : `computeShipping` (`shipping-core.ts`) et l'évaluation de
 * code promo restent la responsabilité de l'appelant.
 */
export function resolveCartSummary(
  state: CartState,
  books: Book[],
  reducedShippingFlags: ReadonlyMap<number, boolean>,
): CartSummary {
  const byId = new Map(books.map((b) => [b.id, b]));
  const missingIds: number[] = [];
  const lines: CartLineView[] = [];

  for (const line of state.lines) {
    const book = byId.get(line.id);
    if (!book) {
      missingIds.push(line.id);
      continue;
    }
    const purchasable = canAddToCart(book) && book.price != null;
    const unitPriceCents = book.price != null ? eurosToCents(book.price) : null;
    lines.push({
      id: book.id,
      title: book.title,
      slug: book.slug,
      edition: book.edition,
      origin: book.origin,
      cover: book.cover,
      href: book.edition ? `/catalogue/${book.edition}/${book.slug}` : `/boutique/${book.slug}`,
      qty: line.qty,
      unitPriceCents,
      lineTotalCents: purchasable && unitPriceCents != null ? unitPriceCents * line.qty : 0,
      purchasable,
      reducedShippingFlag: reducedShippingFlags.get(line.id) ?? false,
    });
  }

  const purchasableLines = lines.filter((l) => l.purchasable);
  const subtotalCents = purchasableLines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const manifestOnly = isManifestOnly(purchasableLines);

  return { lines, missingIds, subtotalCents, manifestOnly };
}

/* ---------------------------------- totaux ---------------------------------- */

export interface CartTotals {
  subtotalCents: number;
  /** Remise appliquée — jamais négative, jamais au-delà du sous-total. */
  discountCents: number;
  subtotalAfterDiscountCents: number;
  /** `null` : port pas encore calculé/refusé (zone non vendue, panier hors grille) — cf. `ShippingResult`. */
  shippingCents: number | null;
  /** `null` tant que `shippingCents` est `null`. */
  totalCents: number | null;
}

/**
 * Assemble sous-total (déjà réduit aux lignes `purchasable`), remise et port
 * en un total final — pure, sans connaître ni le moteur de port ni
 * l'évaluation du code promo (composée par l'appelant, `/panier`).
 */
export function computeCartTotals(
  subtotalCents: number,
  discountCents: number,
  shippingCents: number | null,
): CartTotals {
  const safeDiscount = Math.max(0, Math.min(discountCents, subtotalCents));
  const subtotalAfterDiscountCents = subtotalCents - safeDiscount;
  return {
    subtotalCents,
    discountCents: safeDiscount,
    subtotalAfterDiscountCents,
    shippingCents,
    totalCents: shippingCents == null ? null : subtotalAfterDiscountCents + shippingCents,
  };
}
