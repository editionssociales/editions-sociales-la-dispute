import { describe, expect, it } from "vitest";
import {
  CART_MAX_CENTS,
  computeShipping,
  countLots,
  isWholeLots,
  LOT_SIZE,
  lotPriceEuros,
  LOT_FREE_SHIPPING_MIN_LOTS,
  LOT_SHIPPING_COST_CENTS,
  FREE_SHIPPING_MIN_CART_CENTS,
  isManifestOnly,
  MANIFEST_SHIPPING_COST_CENTS,
  type ShippingRequest,
} from "./shipping-core";

/** Requête minimale valide, à surcharger champ par champ dans chaque test — `hasPhysicalItems: true` par défaut (panier physique, comportement historique). */
function request(overrides: Partial<ShippingRequest> = {}): ShippingRequest {
  return {
    cartTotalCents: 0,
    zone: "FR",
    manifestOnly: false,
    freeShippingCoupon: false,
    hasPhysicalItems: true,
    lotCount: 0,
    ...overrides,
  };
}

describe("computeShipping — grille standard (R2 §2.7), chaque palier", () => {
  it("0–10 € (200 c) — borne basse 0", () => {
    expect(computeShipping(request({ cartTotalCents: 0 }))).toEqual({ ok: true, costCents: 200 });
  });

  it("0–10 € (200 c) — borne haute 10,00 €", () => {
    expect(computeShipping(request({ cartTotalCents: 1000 }))).toEqual({
      ok: true,
      costCents: 200,
    });
  });

  it("11–24 € (450 c) — borne basse 11,00 €", () => {
    expect(computeShipping(request({ cartTotalCents: 1100 }))).toEqual({
      ok: true,
      costCents: 450,
    });
  });

  it("11–24 € (450 c) — borne haute 24,00 €", () => {
    expect(computeShipping(request({ cartTotalCents: 2400 }))).toEqual({
      ok: true,
      costCents: 450,
    });
  });

  it("25–49 € (550 c) — borne basse 25,00 €", () => {
    expect(computeShipping(request({ cartTotalCents: 2500 }))).toEqual({
      ok: true,
      costCents: 550,
    });
  });

  it("25–49 € (550 c) — borne haute 49,00 €", () => {
    expect(computeShipping(request({ cartTotalCents: 4900 }))).toEqual({
      ok: true,
      costCents: 550,
    });
  });

  it("50–500 € (650 c) — borne basse 50,00 €", () => {
    expect(computeShipping(request({ cartTotalCents: 5000 }))).toEqual({
      ok: true,
      costCents: 650,
    });
  });

  it("50–500 € (650 c) — borne haute 500,00 €", () => {
    expect(computeShipping(request({ cartTotalCents: 50000 }))).toEqual({
      ok: true,
      costCents: 650,
    });
  });
});

describe("computeShipping — grille lissée (décision 13/07) : ex-trous couverts par le palier supérieur", () => {
  it("10,01 € / 10,50 € / 10,99 € (ex-trou 10–11) → palier 10,01–24 € (450 c)", () => {
    for (const cents of [1001, 1050, 1099]) {
      expect(computeShipping(request({ cartTotalCents: cents }))).toEqual({
        ok: true,
        costCents: 450,
      });
    }
  });

  it("24,01 € / 24,50 € / 24,99 € (ex-trou 24–25) → palier 24,01–49 € (550 c)", () => {
    for (const cents of [2401, 2450, 2499]) {
      expect(computeShipping(request({ cartTotalCents: cents }))).toEqual({
        ok: true,
        costCents: 550,
      });
    }
  });

  it("49,01 € / 49,50 € / 49,99 € (ex-trou 49–50) → palier 49,01–500 € (650 c)", () => {
    for (const cents of [4901, 4950, 4999]) {
      expect(computeShipping(request({ cartTotalCents: cents }))).toEqual({
        ok: true,
        costCents: 650,
      });
    }
  });

  it("> 500 € — refus explicite (500,01 € et 600,00 €), commande à traiter par email", () => {
    expect(computeShipping(request({ cartTotalCents: CART_MAX_CENTS + 1 }))).toEqual({
      ok: false,
      reason: "cart-too-high",
      message: expect.stringContaining("500 €"),
    });
    expect(computeShipping(request({ cartTotalCents: 60000 }))).toMatchObject({
      ok: false,
      reason: "cart-too-high",
    });
  });

  it("propriété : la grille couvre [0, CART_MAX_CENTS] sans trou — chaque centime a un tarif", () => {
    // Balayer les 50 001 montants est instantané en pur calcul et verrouille
    // structurellement l'absence de trou (le filet d'erreur du module ne doit
    // jamais se déclencher) ; les sauts de tarif n'arrivent qu'aux frontières
    // publiées (10 €→10,01 €, 24 €→24,01 €, 49 €→49,01 €).
    let previous = -1;
    const jumps: number[] = [];
    for (let cents = 0; cents <= CART_MAX_CENTS; cents++) {
      const result = computeShipping(request({ cartTotalCents: cents }));
      if (!result.ok) throw new Error(`refus inattendu à ${cents} centimes`);
      if (previous !== -1 && result.costCents !== previous) jumps.push(cents);
      previous = result.costCents;
    }
    expect(jumps).toEqual([1001, 2401, 4901]);
  });
});

describe("computeShipping — règle « manifeste » (port réduit, panier pur vs mixte)", () => {
  it("panier manifeste PUR (manifestOnly=true) → 2,50 € forfaitaire, quel que soit le montant", () => {
    expect(computeShipping(request({ cartTotalCents: 500, manifestOnly: true }))).toEqual({
      ok: true,
      costCents: MANIFEST_SHIPPING_COST_CENTS,
    });
    expect(computeShipping(request({ cartTotalCents: 4200, manifestOnly: true }))).toEqual({
      ok: true,
      costCents: 250,
    });
  });

  it("panier manifeste PUR au-delà de 500 € → toujours 2,50 € (règle au format, pas à la valeur, pas soumise au refus > 500 €)", () => {
    expect(computeShipping(request({ cartTotalCents: 60000, manifestOnly: true }))).toEqual({
      ok: true,
      costCents: 250,
    });
  });

  it("panier MIXTE (manifestOnly=false, même avec des articles à port réduit dedans) → grille standard, pas 2,50 €", () => {
    expect(computeShipping(request({ cartTotalCents: 1500, manifestOnly: false }))).toEqual({
      ok: true,
      costCents: 450,
    });
  });
});

describe("computeShipping — coupon free_shipping (sous/sur le seuil de 50 €)", () => {
  it("coupon posé, panier SOUS 50 € (49,99 €) → coupon inopérant, grille standard appliquée", () => {
    expect(
      computeShipping(request({ cartTotalCents: 4999, freeShippingCoupon: true })),
    ).toEqual({ ok: true, costCents: 650 }); // 49,99 € = palier 49,01–500 €, PAS gratuit
  });

  it("coupon posé, panier SUR le seuil exact (50,00 €) → gratuit", () => {
    expect(
      computeShipping(
        request({ cartTotalCents: FREE_SHIPPING_MIN_CART_CENTS, freeShippingCoupon: true }),
      ),
    ).toEqual({ ok: true, costCents: 0 });
  });

  it("coupon posé, panier AU-DESSUS de 50 € → gratuit", () => {
    expect(computeShipping(request({ cartTotalCents: 12000, freeShippingCoupon: true }))).toEqual(
      { ok: true, costCents: 0 },
    );
  });

  it("coupon posé ET panier manifeste ≥ 50 € → le coupon gratuit prime sur le forfait manifeste (2,50 € < gratuit)", () => {
    expect(
      computeShipping(
        request({ cartTotalCents: 6000, manifestOnly: true, freeShippingCoupon: true }),
      ),
    ).toEqual({ ok: true, costCents: 0 });
  });

  it("sans coupon, panier ≥ 50 € → grille standard normale (pas de gratuité implicite)", () => {
    expect(computeShipping(request({ cartTotalCents: 6000 }))).toEqual({
      ok: true,
      costCents: 650,
    });
  });
});

describe("computeShipping — zones (FR/BE/CH seules vendues)", () => {
  it("FR, BE, CH acceptées", () => {
    for (const zone of ["FR", "BE", "CH"]) {
      expect(computeShipping(request({ cartTotalCents: 1000, zone }))).toEqual({
        ok: true,
        costCents: 200,
      });
    }
  });

  it("zone en minuscules ou avec espaces, normalisée", () => {
    expect(computeShipping(request({ cartTotalCents: 1000, zone: " fr " }))).toEqual({
      ok: true,
      costCents: 200,
    });
  });

  it("toute autre zone → refus explicite, avant même de regarder le montant", () => {
    expect(computeShipping(request({ cartTotalCents: 1000, zone: "DE" }))).toEqual({
      ok: false,
      reason: "zone",
      message: expect.stringContaining("DE"),
    });
  });

  it("zone refusée même si le panier serait par ailleurs gratuit ou manifeste", () => {
    expect(
      computeShipping(
        request({ cartTotalCents: 6000, zone: "US", freeShippingCoupon: true, manifestOnly: true }),
      ),
    ).toMatchObject({ ok: false, reason: "zone" });
  });
});

describe("computeShipping — aucun article physique (client 2026-09-09, titre numérique seul)", () => {
  it("panier entièrement numérique → 0, SANS même valider la zone", () => {
    expect(
      computeShipping(request({ hasPhysicalItems: false, cartTotalCents: 0, zone: "DE" })),
    ).toEqual({ ok: true, costCents: 0 });
  });

  it("court-circuite AVANT le coupon/la règle manifeste — aucune interaction possible", () => {
    expect(
      computeShipping(
        request({
          hasPhysicalItems: false,
          cartTotalCents: 0,
          manifestOnly: true,
          freeShippingCoupon: false,
        }),
      ),
    ).toEqual({ ok: true, costCents: 0 });
  });

  it("cartTotalCents à 0 dans ce cas (sous-total physique, composé par l'appelant) — jamais un montant du panier numérique", () => {
    // `cart-quote.ts` ne passe QUE le sous-total physique ici ; un panier
    // entièrement numérique a par construction un sous-total physique de 0.
    expect(computeShipping(request({ hasPhysicalItems: false, cartTotalCents: 0 }))).toEqual({
      ok: true,
      costCents: 0,
    });
  });
});

describe("computeShipping — garde-fous d'entrée (centimes entiers)", () => {
  it("cartTotalCents flottant → jette", () => {
    expect(() => computeShipping(request({ cartTotalCents: 10.5 }))).toThrow(TypeError);
  });

  it("cartTotalCents négatif → jette", () => {
    expect(() => computeShipping(request({ cartTotalCents: -1 }))).toThrow(TypeError);
  });
});

describe("isManifestOnly — règle « panier manifeste »", () => {
  it("panier vide → false (rien à livrer en port réduit)", () => {
    expect(isManifestOnly([])).toBe(false);
  });

  it("toutes les lignes à port réduit → true", () => {
    expect(
      isManifestOnly([{ reducedShippingFlag: true }, { reducedShippingFlag: true }]),
    ).toBe(true);
  });

  it("panier mixte (au moins une ligne standard) → false", () => {
    expect(
      isManifestOnly([{ reducedShippingFlag: true }, { reducedShippingFlag: false }]),
    ).toBe(false);
  });
});

describe("computeShipping — vente par lot", () => {
  it("constantes : 10 € le lot, offert dès 2 lots", () => {
    expect(LOT_SHIPPING_COST_CENTS).toBe(1000);
    expect(LOT_FREE_SHIPPING_MIN_LOTS).toBe(2);
  });

  it("1 lot → 10 € forfaitaires, même sur un petit panier", () => {
    expect(computeShipping(request({ cartTotalCents: 500, lotCount: 1 }))).toEqual({ ok: true, costCents: 1000 });
  });

  it("2 lots ou plus → offert", () => {
    expect(computeShipping(request({ cartTotalCents: 9000, lotCount: 2 }))).toEqual({ ok: true, costCents: 0 });
    expect(computeShipping(request({ cartTotalCents: 9000, lotCount: 5 }))).toEqual({ ok: true, costCents: 0 });
  });

  it("1 lot + coupon free_shipping ≥ 50 € → 0 (le coupon prime sur le forfait)", () => {
    expect(
      computeShipping(request({ cartTotalCents: 6000, lotCount: 1, freeShippingCoupon: true })),
    ).toEqual({ ok: true, costCents: 0 });
  });

  it("1 lot + coupon sous 50 € → forfait 10 €", () => {
    expect(
      computeShipping(request({ cartTotalCents: 4000, lotCount: 1, freeShippingCoupon: true })),
    ).toEqual({ ok: true, costCents: 1000 });
  });

  it("1 lot + manifeste → 10 € (le forfait lot prime sur 2,50 €)", () => {
    expect(computeShipping(request({ cartTotalCents: 1000, lotCount: 1, manifestOnly: true }))).toEqual({
      ok: true,
      costCents: 1000,
    });
  });

  it("1 lot + panier > 500 € → pas de refus (la grille standard ne s'applique pas)", () => {
    expect(computeShipping(request({ cartTotalCents: 60000, lotCount: 1 }))).toEqual({ ok: true, costCents: 1000 });
  });

  it("zone invalide → refus même avec des lots", () => {
    expect(computeShipping(request({ zone: "US", lotCount: 3 }))).toMatchObject({ ok: false, reason: "zone" });
  });

  it("aucun article physique → 0 même avec lotCount", () => {
    expect(computeShipping(request({ hasPhysicalItems: false, lotCount: 1 }))).toEqual({ ok: true, costCents: 0 });
  });

  it("lotCount non entier ou négatif → TypeError", () => {
    expect(() => computeShipping(request({ lotCount: 1.5 }))).toThrow(TypeError);
    expect(() => computeShipping(request({ lotCount: -1 }))).toThrow(TypeError);
  });
});

describe("countLots", () => {
  it("compte les tranches COMPLÈTES de LOT_SIZE exemplaires, par ligne physique « lot »", () => {
    expect(LOT_SIZE).toBe(10);
    expect(
      countLots([
        { lot: true, digital: false, qty: 25 }, // 2 lots (5 exemplaires hors lot)
        { lot: true, digital: true, qty: 50 }, // numérique : jamais un lot
        { lot: false, digital: false, qty: 90 }, // titre non coché
        { lot: true, digital: false, qty: 10 }, // 1 lot
      ]),
    ).toBe(3);
    expect(countLots([])).toBe(0);
  });

  it("moins de LOT_SIZE exemplaires d'un titre ne fait pas un lot — et deux titres ne se cumulent pas", () => {
    expect(countLots([{ lot: true, digital: false, qty: 9 }])).toBe(0);
    expect(
      countLots([
        { lot: true, digital: false, qty: 5 },
        { lot: true, digital: false, qty: 5 },
      ]),
    ).toBe(0);
  });
});

describe("vente uniquement par lot — quantité et prix", () => {
  it("isWholeLots : seuls les multiples entiers non nuls de LOT_SIZE se vendent", () => {
    expect([10, 20, 100].every(isWholeLots)).toBe(true);
    expect([0, 1, 9, 15, 25, -10, 10.5].some(isWholeLots)).toBe(false);
  });

  it("lotPriceEuros : 10 × le prix unitaire, sans dérive de flottant", () => {
    expect(lotPriceEuros(5)).toBe(50);
    expect(lotPriceEuros(4.35)).toBe(43.5);
    expect(lotPriceEuros(0.07)).toBe(0.7);
  });
});
