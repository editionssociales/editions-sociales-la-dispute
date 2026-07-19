/**
 * Cœur pur du domaine promo (plan phase 4, §3/étape 6bis et étape 8) — zéro
 * I/O, ne touche ni Payload ni la Local API : `PromoCodeLike` est la forme
 * neutre que l'appelant (`panier/actions.ts`) extrait d'un document
 * `promo-codes` (`overrideAccess: true`, la collection n'a pas de lecture
 * publique, cf. `PromoCodes.ts`). Même découpage pur/impur que
 * `stock-import-core.ts`.
 *
 * Codes promo V1 (décalque du coupon Woo réellement utilisé — décision
 * client, `PromoCodes.ts`) : seuls `fixed_cart` et `free_shipping`.
 */

/**
 * Normalise un code promo saisi au back-office : majuscules, espaces de bord
 * retirés — pour qu'`AGREG2027`, `agreg2027 ` et ` Agreg2027` désignent le
 * même code à la validation du checkout (plan phase 4, §3/étape 8).
 */
export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface PromoCodeLike {
  code: string;
  type: "fixed_cart" | "free_shipping";
  /** Euros — ignoré pour `free_shipping` (cf. `PromoCodes.ts`). */
  amount?: number | null;
  /** Euros — panier minimum TTC pour que le code s'applique. */
  minCart?: number | null;
  /** ISO — `null`/absent = jamais expiré. */
  expiresAt?: string | null;
  active: boolean;
}

export type PromoRefusalReason = "not-found" | "inactive" | "expired" | "min-cart";

export type PromoEvalResult =
  | { ok: true; type: "fixed_cart"; discountCents: number }
  | { ok: true; type: "free_shipping" }
  | { ok: false; reason: PromoRefusalReason; message: string };

/** Euros → centimes entiers — même règle que `cart-core.ts:priceToCents` (jamais de flottant sur de l'argent). */
function toCents(euros: number): number {
  return Math.round(euros * 100);
}

/**
 * LE prédicat d'expiration jour-INCLUSIF (un code expirant le 13/07 vaut
 * toute la journée du 13/07, décision produit 17/07) — consommé par
 * `evaluatePromoCode` ET par le dashboard (`expiredActivePromos`).
 */
export function isPromoExpired(expiresAt: string | null | undefined, now: Date): boolean {
  return typeof expiresAt === "string" && expiresAt.slice(0, 10) < now.toISOString().slice(0, 10);
}

/**
 * Évalue un code promo contre le sous-total TTC du panier (en CENTIMES,
 * AVANT remise — le panier minimum d'un code se lit sur la valeur brute, pas
 * déjà réduite par lui-même). `now` est injectable pour les tests
 * (expiration), jamais lu par défaut ailleurs qu'ici.
 *
 * Ordre des règles : code introuvable → inactif → expiré → panier sous le
 * minimum → sinon valide (remise calculée, jamais au-delà du sous-total —
 * ce dernier plafond reste la responsabilité de `computeCartTotals`,
 * ce module ne connaît pas le sous-total une fois la remise appliquée).
 *
 * Expiration en JOUR INCLUSIF (décision produit 17/07) : un code dont
 * `expiresAt` tombe le 13/07 reste valable toute la journée du 13/07 — même
 * comparaison lexicographique sur `slice(0, 10)` que `sellability.ts:isUpcoming`
 * et le panneau codes promo du dashboard (`derive.ts:expiredActivePromos`).
 */
export function evaluatePromoCode(
  promo: PromoCodeLike | null,
  cartTotalCents: number,
  now: Date = new Date(),
): PromoEvalResult {
  if (!promo) {
    return { ok: false, reason: "not-found", message: "Code promo introuvable." };
  }
  if (!promo.active) {
    return { ok: false, reason: "inactive", message: "Ce code promo n’est plus actif." };
  }
  if (isPromoExpired(promo.expiresAt, now)) {
    return { ok: false, reason: "expired", message: "Ce code promo a expiré." };
  }
  if (promo.minCart != null && cartTotalCents < toCents(promo.minCart)) {
    return {
      ok: false,
      reason: "min-cart",
      message: `Ce code s’applique à partir de ${promo.minCart.toFixed(2)} € d’achat.`,
    };
  }

  if (promo.type === "free_shipping") {
    return { ok: true, type: "free_shipping" };
  }
  return { ok: true, type: "fixed_cart", discountCents: toCents(promo.amount ?? 0) };
}
