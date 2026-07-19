import { describe, expect, it } from "vitest";
import { computeCartQuote, type CartQuoteInput } from "./cart-quote";
import { FREE_SHIPPING_MIN_CART_CENTS, MANIFEST_SHIPPING_COST_CENTS } from "./shipping-core";
import type { PromoEvalResult } from "./promo-core";

/** Requête minimale valide, à surcharger champ par champ dans chaque test. */
function input(overrides: Partial<CartQuoteInput> = {}): CartQuoteInput {
  return {
    subtotalCents: 2000,
    zone: "FR",
    manifestOnly: false,
    promoEval: null,
    ...overrides,
  };
}

describe("computeCartQuote — aucun code promo", () => {
  it("aucune remise, aucune livraison offerte, port standard", () => {
    const quote = computeCartQuote(input({ subtotalCents: 2000 }));
    expect(quote.discountCents).toBe(0);
    expect(quote.freeShippingCoupon).toBe(false);
    expect(quote.shipping).toEqual({ ok: true, costCents: 450 });
    expect(quote.totals).toEqual({
      subtotalCents: 2000,
      discountCents: 0,
      subtotalAfterDiscountCents: 2000,
      shippingCents: 450,
      totalCents: 2450,
    });
    expect(quote.shippingMethod).toBe("standard");
  });

  it("panier « manifeste » : port réduit forfaitaire, méthode « réduit »", () => {
    const quote = computeCartQuote(input({ subtotalCents: 2000, manifestOnly: true }));
    expect(quote.shipping).toEqual({ ok: true, costCents: MANIFEST_SHIPPING_COST_CENTS });
    expect(quote.shippingMethod).toBe("reduit");
  });
});

describe("computeCartQuote — code promo fixed_cart", () => {
  const promoEval: PromoEvalResult = { ok: true, type: "fixed_cart", discountCents: 500 };

  it("remise reportée sur discountCents et sur le total, port inchangé", () => {
    const quote = computeCartQuote(input({ subtotalCents: 2000, promoEval }));
    expect(quote.discountCents).toBe(500);
    expect(quote.freeShippingCoupon).toBe(false);
    expect(quote.totals.subtotalAfterDiscountCents).toBe(1500);
    expect(quote.totals.totalCents).toBe(1500 + 450);
  });

  it("plafonnée au sous-total par computeCartTotals — jamais de total négatif", () => {
    const bigDiscount: PromoEvalResult = { ok: true, type: "fixed_cart", discountCents: 999_999 };
    const quote = computeCartQuote(input({ subtotalCents: 2000, promoEval: bigDiscount }));
    expect(quote.totals.discountCents).toBe(2000);
    expect(quote.totals.subtotalAfterDiscountCents).toBe(0);
  });
});

describe("computeCartQuote — code promo free_shipping", () => {
  const promoEval: PromoEvalResult = { ok: true, type: "free_shipping" };

  it("port gratuit si le sous-total atteint le plancher → méthode « offert »", () => {
    const quote = computeCartQuote(input({ subtotalCents: FREE_SHIPPING_MIN_CART_CENTS, promoEval }));
    expect(quote.freeShippingCoupon).toBe(true);
    expect(quote.shipping).toEqual({ ok: true, costCents: 0 });
    expect(quote.totals.totalCents).toBe(FREE_SHIPPING_MIN_CART_CENTS);
    expect(quote.shippingMethod).toBe("offert");
  });

  it("sous le plancher : le coupon est reconnu, le port reste payant (grille standard) et l'étiquette redevient « standard » — LA correction (l'ancien resolveShippingMethod aurait dit « offert »)", () => {
    const quote = computeCartQuote(input({ subtotalCents: 2000, promoEval }));
    expect(quote.freeShippingCoupon).toBe(true);
    expect(quote.shipping).toEqual({ ok: true, costCents: 450 });
    expect(quote.shippingMethod).toBe("standard");
  });

  it("prime toujours sur la règle « manifeste » (même ordre que shipping-core) → méthode « offert »", () => {
    const quote = computeCartQuote(
      input({ subtotalCents: FREE_SHIPPING_MIN_CART_CENTS, manifestOnly: true, promoEval }),
    );
    expect(quote.shipping).toEqual({ ok: true, costCents: 0 });
    expect(quote.shippingMethod).toBe("offert");
  });
});

describe("computeCartQuote — verdict promo refusé", () => {
  it("traité comme absence de code : aucune remise, aucune livraison offerte", () => {
    const refusal: PromoEvalResult = { ok: false, reason: "expired", message: "Ce code promo a expiré." };
    const quote = computeCartQuote(input({ subtotalCents: 2000, promoEval: refusal }));
    expect(quote.discountCents).toBe(0);
    expect(quote.freeShippingCoupon).toBe(false);
    expect(quote.shipping).toEqual({ ok: true, costCents: 450 });
  });
});

describe("computeCartQuote — port refusé", () => {
  it("zone non vendue : shipping refusé, totals.shippingCents/totalCents à null", () => {
    const quote = computeCartQuote(input({ subtotalCents: 2000, zone: "DE" }));
    expect(quote.shipping.ok).toBe(false);
    expect(quote.totals.shippingCents).toBeNull();
    expect(quote.totals.totalCents).toBeNull();
    // Le sous-total et la remise restent renseignés même si le port est refusé.
    expect(quote.totals.subtotalCents).toBe(2000);
  });
});
