/**
 * Devis unique du panier (sous-total → remise → port → total) — compose
 * `computeShipping` (`shipping-core.ts`) et `computeCartTotals`
 * (`cart-core.ts`) à partir d'un verdict `evaluatePromoCode` (`promo-core.ts`)
 * déjà résolu. Avant ce module, cette composition — dériver
 * `freeShippingCoupon`/`discountCents` du verdict promo, appeler
 * `computeShipping`, puis `computeCartTotals` — était RÉÉCRITE à l'identique
 * à deux endroits : l'affichage client (`panier/cart-view.tsx`, un devis
 * provisoire) et la re-validation serveur (`api/checkout/route.ts`, le même
 * devis mais sur des lignes fraîchement relues) — deux copies qui auraient pu
 * diverger silencieusement (l'ordre « coupon `free_shipping` prime toujours
 * sur la règle manifeste », par ex., n'est correct qu'une fois, dans
 * `computeShipping`). Un seul point compose désormais les trois modules
 * purs ; chaque appelant ne fournit plus que `subtotalCents`/`zone`/
 * `manifestOnly` et le verdict promo déjà résolu — la lecture I/O du code
 * promo (`getPromoCodeRecord`) reste sa responsabilité.
 *
 * Zéro I/O ici, comme les trois modules composés.
 */
import { computeCartTotals, type CartTotals } from "./cart-core";
import { computeShipping, type ShippingResult } from "./shipping-core";
import type { PromoEvalResult } from "./promo-core";

export interface CartQuoteInput {
  /** Sous-total TTC des lignes achetables, en centimes (`resolveCartSummary`/`validateCheckoutLines`). */
  subtotalCents: number;
  /** Zone de livraison déclarée — `computeShipping` la valide, ce module ne la revérifie pas. */
  zone: string;
  /** Panier composé UNIQUEMENT d'articles à port réduit (`shipping-core.ts`). */
  manifestOnly: boolean;
  /** Verdict déjà résolu par `evaluatePromoCode` — `null` = aucun code promo soumis/appliqué. */
  promoEval: PromoEvalResult | null;
}

export interface CartQuote {
  /** Remise en centimes — 0 si aucun code `fixed_cart` valide n'est appliqué. */
  discountCents: number;
  /** `true` ssi un code `free_shipping` valide est appliqué — dérivé du même verdict que `discountCents`. */
  freeShippingCoupon: boolean;
  shipping: ShippingResult;
  totals: CartTotals;
}

/**
 * Compose le devis complet à partir d'un sous-total et d'un verdict promo
 * déjà résolu — ORDRE fixe (identique aux deux appelants avant extraction) :
 * `freeShippingCoupon`/`discountCents` dérivés du verdict, port calculé par
 * `computeShipping` (le coupon `free_shipping` y prime toujours sur la règle
 * « manifeste »), puis total assemblé par `computeCartTotals`.
 */
export function computeCartQuote(input: CartQuoteInput): CartQuote {
  const freeShippingCoupon = input.promoEval?.ok === true && input.promoEval.type === "free_shipping";
  const discountCents =
    input.promoEval?.ok === true && input.promoEval.type === "fixed_cart"
      ? input.promoEval.discountCents
      : 0;

  const shipping = computeShipping({
    cartTotalCents: input.subtotalCents,
    zone: input.zone,
    manifestOnly: input.manifestOnly,
    freeShippingCoupon,
  });

  const totals = computeCartTotals(
    input.subtotalCents,
    discountCents,
    shipping.ok ? shipping.costCents : null,
  );

  return { discountCents, freeShippingCoupon, shipping, totals };
}
