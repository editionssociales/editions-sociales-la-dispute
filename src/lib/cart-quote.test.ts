import { describe, expect, it } from "vitest";
import { computeCartQuote, type CartQuoteInput } from "./cart-quote";
import { FREE_SHIPPING_MIN_CART_CENTS, MANIFEST_SHIPPING_COST_CENTS } from "./shipping-core";
import type { PromoEvalResult } from "./promo-core";

/**
 * Requête minimale valide, à surcharger champ par champ dans chaque test —
 * par défaut un panier homogène « normal » (pas de précommande), même
 * scénario que l'ancienne suite avant la scission 2026-08-20.
 */
function input(overrides: Partial<CartQuoteInput> = {}): CartQuoteInput {
  return {
    normalSubtotalCents: 2000,
    preorderSubtotalCents: 0,
    hasNormalLines: true,
    hasPreorderLines: false,
    zone: "FR",
    manifestOnly: false,
    promoEval: null,
    ...overrides,
  };
}

describe("computeCartQuote — panier homogène « paru » (aucun changement de comportement)", () => {
  it("aucune remise, aucune livraison offerte, port standard, un seul envoi", () => {
    const quote = computeCartQuote(input({ normalSubtotalCents: 2000 }));
    expect(quote.split).toBe(false);
    expect(quote.shipments).toBe(1);
    expect(quote.totals.discountCents).toBe(0);
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
    // Toute la partie précommande reste à zéro — panier homogène.
    expect(quote.preorder).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      subtotalAfterDiscountCents: 0,
      shippingCents: 0,
      totalCents: 0,
    });
    expect(quote.normal.totalCents).toBe(2450);
  });

  it("panier « manifeste » : port réduit forfaitaire, méthode « réduit »", () => {
    const quote = computeCartQuote(input({ normalSubtotalCents: 2000, manifestOnly: true }));
    expect(quote.shipping).toEqual({ ok: true, costCents: MANIFEST_SHIPPING_COST_CENTS });
    expect(quote.shippingMethod).toBe("reduit");
  });
});

describe("computeCartQuote — panier homogène « précommande » (aucune ligne parue)", () => {
  it("toute la commande part dans `preorder`, `normal` à zéro, un seul envoi", () => {
    const quote = computeCartQuote(
      input({ normalSubtotalCents: 0, hasNormalLines: false, preorderSubtotalCents: 3000, hasPreorderLines: true }),
    );
    expect(quote.split).toBe(false);
    expect(quote.shipments).toBe(1);
    expect(quote.normal).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      subtotalAfterDiscountCents: 0,
      shippingCents: 0,
      totalCents: 0,
    });
    // Barème résolu sur 30€ → tranche 25-49€ → 5,50€, facturé UNE fois sur la précommande.
    expect(quote.preorder.subtotalCents).toBe(3000);
    expect(quote.preorder.shippingCents).toBe(550);
    expect(quote.preorder.totalCents).toBe(3550);
    expect(quote.totals.totalCents).toBe(3550);
  });
});

describe("computeCartQuote — panier MIXTE (scission commande/précommande, client 2026-08-20)", () => {
  it("scission détectée (`split`), DEUX envois facturés au MÊME tarif — celui résolu sur le total COMBINÉ", () => {
    // Combiné 20€ (normal) + 10€ (précommande) = 30€ → tranche 25-49€ → 5,50€ par envoi.
    const quote = computeCartQuote(
      input({
        normalSubtotalCents: 2000,
        hasNormalLines: true,
        preorderSubtotalCents: 1000,
        hasPreorderLines: true,
      }),
    );
    expect(quote.split).toBe(true);
    expect(quote.shipments).toBe(2);
    expect(quote.shipping).toEqual({ ok: true, costCents: 550 }); // le tarif d'UN envoi
    expect(quote.normal.shippingCents).toBe(550);
    expect(quote.preorder.shippingCents).toBe(550);
    // Le client paie 2× le tarif du palier « total » : 30€ marchandise + 11€ de port.
    expect(quote.totals.subtotalCents).toBe(3000);
    expect(quote.totals.shippingCents).toBe(1100);
    expect(quote.totals.totalCents).toBe(4100);
    // Somme exacte des deux parties.
    expect((quote.normal.totalCents ?? 0) + (quote.preorder.totalCents ?? 0)).toBe(quote.totals.totalCents);
  });

  it("un panier mixte SOUS 10€ combinés reste au palier 0-10€ (200) — mais payé DEUX fois (400 au total)", () => {
    const quote = computeCartQuote(
      input({
        normalSubtotalCents: 500,
        hasNormalLines: true,
        preorderSubtotalCents: 300,
        hasPreorderLines: true,
      }),
    );
    expect(quote.shipping).toEqual({ ok: true, costCents: 200 });
    expect(quote.totals.shippingCents).toBe(400);
  });

  it("panier mixte « manifeste » (toutes les lignes des DEUX parties à port réduit) → 2,50€ par envoi, 5€ au total", () => {
    const quote = computeCartQuote(
      input({
        normalSubtotalCents: 2000,
        hasNormalLines: true,
        preorderSubtotalCents: 1000,
        hasPreorderLines: true,
        manifestOnly: true,
      }),
    );
    expect(quote.shipping).toEqual({ ok: true, costCents: MANIFEST_SHIPPING_COST_CENTS });
    expect(quote.shippingMethod).toBe("reduit");
    expect(quote.totals.shippingCents).toBe(MANIFEST_SHIPPING_COST_CENTS * 2);
  });

  it("remise fixed_cart allouée au PRORATA des deux sous-totaux, somme EXACTE reconstituée", () => {
    const promoEval: PromoEvalResult = { ok: true, type: "fixed_cart", discountCents: 900 };
    // normal 2000 / preorder 1000 → combiné 3000 → prorata 2/3—1/3 : 600 / 300.
    const quote = computeCartQuote(
      input({
        normalSubtotalCents: 2000,
        hasNormalLines: true,
        preorderSubtotalCents: 1000,
        hasPreorderLines: true,
        promoEval,
      }),
    );
    expect(quote.normal.discountCents).toBe(600);
    expect(quote.preorder.discountCents).toBe(300);
    expect(quote.normal.discountCents + quote.preorder.discountCents).toBe(quote.totals.discountCents);
    expect(quote.totals.discountCents).toBe(900);
  });

  it("remise fixed_cart avec répartition non entière (troncature sur `normal`, reliquat sur `preorder`)", () => {
    const promoEval: PromoEvalResult = { ok: true, type: "fixed_cart", discountCents: 100 };
    // normal 100 / preorder 200 → combiné 300 → normal: floor(100*100/300)=33, preorder: 100-33=67.
    const quote = computeCartQuote(
      input({
        normalSubtotalCents: 100,
        hasNormalLines: true,
        preorderSubtotalCents: 200,
        hasPreorderLines: true,
        promoEval,
      }),
    );
    expect(quote.normal.discountCents).toBe(33);
    expect(quote.preorder.discountCents).toBe(67);
    expect(quote.normal.discountCents).toBeLessThanOrEqual(100);
    expect(quote.preorder.discountCents).toBeLessThanOrEqual(200);
  });

  it("remise fixed_cart plafonnée à 100% : chaque partie plafonnée à SON propre sous-total, jamais négative", () => {
    const promoEval: PromoEvalResult = { ok: true, type: "fixed_cart", discountCents: 999_999 };
    const quote = computeCartQuote(
      input({
        normalSubtotalCents: 700,
        hasNormalLines: true,
        preorderSubtotalCents: 300,
        hasPreorderLines: true,
        promoEval,
      }),
    );
    expect(quote.normal.discountCents).toBe(700);
    expect(quote.preorder.discountCents).toBe(300);
    expect(quote.normal.subtotalAfterDiscountCents).toBe(0);
    expect(quote.preorder.subtotalAfterDiscountCents).toBe(0);
  });

  it("code free_shipping sur panier mixte ≥ 50€ combinés → port à 0 pour LES DEUX envois, méthode « offert »", () => {
    const promoEval: PromoEvalResult = { ok: true, type: "free_shipping" };
    const quote = computeCartQuote(
      input({
        normalSubtotalCents: FREE_SHIPPING_MIN_CART_CENTS,
        hasNormalLines: true,
        preorderSubtotalCents: 1000,
        hasPreorderLines: true,
        promoEval,
      }),
    );
    expect(quote.shipping).toEqual({ ok: true, costCents: 0 });
    expect(quote.normal.shippingCents).toBe(0);
    expect(quote.preorder.shippingCents).toBe(0);
    expect(quote.totals.shippingCents).toBe(0);
    expect(quote.shippingMethod).toBe("offert");
  });

  it("port refusé (zone non vendue) sur panier mixte → les DEUX parties à `shippingCents`/`totalCents` null", () => {
    const quote = computeCartQuote(
      input({
        normalSubtotalCents: 2000,
        hasNormalLines: true,
        preorderSubtotalCents: 1000,
        hasPreorderLines: true,
        zone: "DE",
      }),
    );
    expect(quote.shipping.ok).toBe(false);
    expect(quote.normal.shippingCents).toBeNull();
    expect(quote.normal.totalCents).toBeNull();
    expect(quote.preorder.shippingCents).toBeNull();
    expect(quote.preorder.totalCents).toBeNull();
    expect(quote.totals.shippingCents).toBeNull();
    expect(quote.totals.totalCents).toBeNull();
    // Les sous-totaux restent renseignés même si le port est refusé.
    expect(quote.normal.subtotalCents).toBe(2000);
    expect(quote.preorder.subtotalCents).toBe(1000);
  });
});

describe("computeCartQuote — code promo fixed_cart (panier homogène)", () => {
  const promoEval: PromoEvalResult = { ok: true, type: "fixed_cart", discountCents: 500 };

  it("remise reportée sur discountCents et sur le total, port inchangé", () => {
    const quote = computeCartQuote(input({ normalSubtotalCents: 2000, promoEval }));
    expect(quote.totals.discountCents).toBe(500);
    expect(quote.freeShippingCoupon).toBe(false);
    expect(quote.totals.subtotalAfterDiscountCents).toBe(1500);
    expect(quote.totals.totalCents).toBe(1500 + 450);
  });

  it("plafonnée au sous-total par computeCartTotals — jamais de total négatif", () => {
    const bigDiscount: PromoEvalResult = { ok: true, type: "fixed_cart", discountCents: 999_999 };
    const quote = computeCartQuote(input({ normalSubtotalCents: 2000, promoEval: bigDiscount }));
    expect(quote.totals.discountCents).toBe(2000);
    expect(quote.totals.subtotalAfterDiscountCents).toBe(0);
  });
});

describe("computeCartQuote — code promo free_shipping (panier homogène)", () => {
  const promoEval: PromoEvalResult = { ok: true, type: "free_shipping" };

  it("port gratuit si le sous-total atteint le plancher → méthode « offert »", () => {
    const quote = computeCartQuote(input({ normalSubtotalCents: FREE_SHIPPING_MIN_CART_CENTS, promoEval }));
    expect(quote.freeShippingCoupon).toBe(true);
    expect(quote.shipping).toEqual({ ok: true, costCents: 0 });
    expect(quote.totals.totalCents).toBe(FREE_SHIPPING_MIN_CART_CENTS);
    expect(quote.shippingMethod).toBe("offert");
  });

  it("sous le plancher : le coupon est reconnu, le port reste payant (grille standard) et l'étiquette redevient « standard » — LA correction (l'ancien resolveShippingMethod aurait dit « offert »)", () => {
    const quote = computeCartQuote(input({ normalSubtotalCents: 2000, promoEval }));
    expect(quote.freeShippingCoupon).toBe(true);
    expect(quote.shipping).toEqual({ ok: true, costCents: 450 });
    expect(quote.shippingMethod).toBe("standard");
  });

  it("prime toujours sur la règle « manifeste » (même ordre que shipping-core) → méthode « offert »", () => {
    const quote = computeCartQuote(
      input({ normalSubtotalCents: FREE_SHIPPING_MIN_CART_CENTS, manifestOnly: true, promoEval }),
    );
    expect(quote.shipping).toEqual({ ok: true, costCents: 0 });
    expect(quote.shippingMethod).toBe("offert");
  });
});

describe("computeCartQuote — verdict promo refusé", () => {
  it("traité comme absence de code : aucune remise, aucune livraison offerte", () => {
    const refusal: PromoEvalResult = { ok: false, reason: "expired", message: "Ce code promo a expiré." };
    const quote = computeCartQuote(input({ normalSubtotalCents: 2000, promoEval: refusal }));
    expect(quote.totals.discountCents).toBe(0);
    expect(quote.freeShippingCoupon).toBe(false);
    expect(quote.shipping).toEqual({ ok: true, costCents: 450 });
  });
});

describe("computeCartQuote — port refusé (panier homogène)", () => {
  it("zone non vendue : shipping refusé, totals.shippingCents/totalCents à null", () => {
    const quote = computeCartQuote(input({ normalSubtotalCents: 2000, zone: "DE" }));
    expect(quote.shipping.ok).toBe(false);
    expect(quote.totals.shippingCents).toBeNull();
    expect(quote.totals.totalCents).toBeNull();
    // Le sous-total et la remise restent renseignés même si le port est refusé.
    expect(quote.totals.subtotalCents).toBe(2000);
  });
});
