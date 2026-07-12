import { describe, expect, it } from "vitest";
import {
  computeShipping,
  FREE_SHIPPING_MIN_CART_CENTS,
  GRID_HOLE_DECISIONS,
  MANIFEST_SHIPPING_COST_CENTS,
  type ShippingRequest,
} from "./shipping-core";

/** Requête minimale valide, à surcharger champ par champ dans chaque test. */
function request(overrides: Partial<ShippingRequest> = {}): ShippingRequest {
  return {
    cartTotalCents: 0,
    zone: "FR",
    manifestOnly: false,
    freeShippingCoupon: false,
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

describe("computeShipping — les quatre trous de la grille (défaut : palier supérieur)", () => {
  it("trou 10–11 € — borne basse 10,01 € rattachée au palier 11–24 € (450 c)", () => {
    expect(computeShipping(request({ cartTotalCents: 1001 }))).toEqual({
      ok: true,
      costCents: 450,
    });
  });

  it("trou 10–11 € — milieu 10,50 € rattaché au palier 11–24 € (450 c)", () => {
    expect(computeShipping(request({ cartTotalCents: 1050 }))).toEqual({
      ok: true,
      costCents: 450,
    });
  });

  it("trou 10–11 € — borne haute 10,99 € rattachée au palier 11–24 € (450 c)", () => {
    expect(computeShipping(request({ cartTotalCents: 1099 }))).toEqual({
      ok: true,
      costCents: 450,
    });
  });

  it("trou 24–25 € — milieu 24,50 € rattaché au palier 25–49 € (550 c)", () => {
    expect(computeShipping(request({ cartTotalCents: 2450 }))).toEqual({
      ok: true,
      costCents: 550,
    });
  });

  it("trou 24–25 € — bornes 24,01 € et 24,99 € rattachées au palier 25–49 € (550 c)", () => {
    expect(computeShipping(request({ cartTotalCents: 2401 }))).toEqual({
      ok: true,
      costCents: 550,
    });
    expect(computeShipping(request({ cartTotalCents: 2499 }))).toEqual({
      ok: true,
      costCents: 550,
    });
  });

  it("trou 49–50 € — milieu 49,50 € rattaché au palier 50–500 € (650 c)", () => {
    expect(computeShipping(request({ cartTotalCents: 4950 }))).toEqual({
      ok: true,
      costCents: 650,
    });
  });

  it("trou 49–50 € — bornes 49,01 € et 49,99 € rattachées au palier 50–500 € (650 c)", () => {
    expect(computeShipping(request({ cartTotalCents: 4901 }))).toEqual({
      ok: true,
      costCents: 650,
    });
    expect(computeShipping(request({ cartTotalCents: 4999 }))).toEqual({
      ok: true,
      costCents: 650,
    });
  });

  it("> 500 € — refus explicite (500,01 € et 600,00 €), commande à traiter par email", () => {
    expect(computeShipping(request({ cartTotalCents: 50001 }))).toEqual({
      ok: false,
      reason: "cart-too-high",
      message: expect.stringContaining("500 €"),
    });
    expect(computeShipping(request({ cartTotalCents: 60000 }))).toMatchObject({
      ok: false,
      reason: "cart-too-high",
    });
  });

  it("la table GRID_HOLE_DECISIONS documente bien les 4 trous, marqués TODO décision client 15/07", () => {
    expect(GRID_HOLE_DECISIONS.map((h) => h.id)).toEqual(["10-11", "24-25", "49-50", ">500"]);
    const priceHoles = GRID_HOLE_DECISIONS.filter((h) => h.id !== ">500");
    expect(priceHoles).toHaveLength(3);
    for (const hole of priceHoles) {
      expect(hole.note).toMatch(/décision client 15\/07/);
      expect(hole.decision.kind).toBe("attach-tier");
    }
    expect(GRID_HOLE_DECISIONS.find((h) => h.id === ">500")?.decision.kind).toBe("refuse");
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
    ).toEqual({ ok: true, costCents: 650 }); // trou 49–50 rattaché au palier supérieur, PAS gratuit
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

describe("computeShipping — garde-fous d'entrée (centimes entiers)", () => {
  it("cartTotalCents flottant → jette", () => {
    expect(() => computeShipping(request({ cartTotalCents: 10.5 }))).toThrow(TypeError);
  });

  it("cartTotalCents négatif → jette", () => {
    expect(() => computeShipping(request({ cartTotalCents: -1 }))).toThrow(TypeError);
  });
});
