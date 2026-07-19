import { describe, expect, it } from "vitest";

import { evaluatePromoCode, isPromoExpired, normalizePromoCode, type PromoCodeLike } from "./promo-core";

describe("normalizePromoCode", () => {
  it("met en majuscules", () => {
    expect(normalizePromoCode("agreg2027")).toBe("AGREG2027");
  });

  it("retire les espaces de bord", () => {
    expect(normalizePromoCode("  Agreg2027 ")).toBe("AGREG2027");
  });

  it("est idempotente", () => {
    expect(normalizePromoCode(normalizePromoCode("agreg2027"))).toBe("AGREG2027");
  });
});

const NOW = new Date("2026-07-12T10:00:00.000Z");

const fixedCart = (over: Partial<PromoCodeLike> = {}): PromoCodeLike => ({
  code: "AGREG2027",
  type: "fixed_cart",
  amount: 5,
  minCart: null,
  expiresAt: null,
  active: true,
  ...over,
});

describe("isPromoExpired", () => {
  it("expiresAt absent → jamais expiré", () => {
    expect(isPromoExpired(undefined, NOW)).toBe(false);
  });

  it("expiresAt null → jamais expiré", () => {
    expect(isPromoExpired(null, NOW)).toBe(false);
  });

  it("expire aujourd'hui (jour inclusif) → pas encore expiré", () => {
    expect(isPromoExpired("2026-07-12", NOW)).toBe(false);
  });

  it("expiré hier → expiré", () => {
    expect(isPromoExpired("2026-07-11", NOW)).toBe(true);
  });
});

describe("evaluatePromoCode", () => {
  it("code introuvable (null) → not-found", () => {
    expect(evaluatePromoCode(null, 5000, NOW)).toEqual({
      ok: false,
      reason: "not-found",
      message: "Code promo introuvable.",
    });
  });

  it("code inactif → inactive", () => {
    const result = evaluatePromoCode(fixedCart({ active: false }), 5000, NOW);
    expect(result).toEqual({ ok: false, reason: "inactive", message: "Ce code promo n’est plus actif." });
  });

  it("code expiré (avant `now`) → expired", () => {
    const result = evaluatePromoCode(fixedCart({ expiresAt: "2026-01-01T00:00:00.000Z" }), 5000, NOW);
    expect(result).toEqual({ ok: false, reason: "expired", message: "Ce code promo a expiré." });
  });

  it("code dont la date d’expiration est encore à venir → pas expiré", () => {
    const result = evaluatePromoCode(fixedCart({ expiresAt: "2026-12-31T00:00:00.000Z" }), 5000, NOW);
    expect(result.ok).toBe(true);
  });

  it("jour d’expiration inclusif : `expiresAt` = jour de `now` (même si plus tôt dans la journée) → encore valide", () => {
    // NOW = 2026-07-12T10:00:00.000Z — un `expiresAt` daté du même jour, même
    // sans heure (minuit implicite), reste valable toute la journée (décision
    // produit 17/07, alignée `catalogue-core.ts:isUpcoming` et le dashboard).
    const result = evaluatePromoCode(fixedCart({ expiresAt: "2026-07-12" }), 5000, NOW);
    expect(result.ok).toBe(true);
  });

  it("jour d’expiration inclusif : `expiresAt` = veille de `now` → expiré", () => {
    const result = evaluatePromoCode(fixedCart({ expiresAt: "2026-07-11" }), 5000, NOW);
    expect(result).toEqual({ ok: false, reason: "expired", message: "Ce code promo a expiré." });
  });

  it("panier sous le minimum requis → min-cart, message en euros", () => {
    const result = evaluatePromoCode(fixedCart({ minCart: 50 }), 4999, NOW);
    expect(result).toEqual({
      ok: false,
      reason: "min-cart",
      message: "Ce code s’applique à partir de 50.00 € d’achat.",
    });
  });

  it("panier à exactement le minimum requis → accepté (borne inclusive)", () => {
    const result = evaluatePromoCode(fixedCart({ minCart: 50 }), 5000, NOW);
    expect(result.ok).toBe(true);
  });

  it("fixed_cart valide → remise en centimes, arrondie", () => {
    const result = evaluatePromoCode(fixedCart({ amount: 12.5 }), 10000, NOW);
    expect(result).toEqual({ ok: true, type: "fixed_cart", discountCents: 1250 });
  });

  it("fixed_cart sans montant renseigné → remise nulle (jamais NaN)", () => {
    const result = evaluatePromoCode(fixedCart({ amount: null }), 10000, NOW);
    expect(result).toEqual({ ok: true, type: "fixed_cart", discountCents: 0 });
  });

  it("free_shipping valide → ok, sans discountCents (le port gratuit est décidé par shipping-core)", () => {
    const result = evaluatePromoCode(
      fixedCart({ type: "free_shipping", amount: null, minCart: 50 }),
      6000,
      NOW,
    );
    expect(result).toEqual({ ok: true, type: "free_shipping" });
  });

  it("ordre des règles : inactif prime sur expiré et sur min-cart", () => {
    const result = evaluatePromoCode(
      fixedCart({ active: false, expiresAt: "2020-01-01T00:00:00.000Z", minCart: 999 }),
      0,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "inactive", message: "Ce code promo n’est plus actif." });
  });

  it("ordre des règles : expiré prime sur min-cart", () => {
    const result = evaluatePromoCode(
      fixedCart({ expiresAt: "2020-01-01T00:00:00.000Z", minCart: 999 }),
      0,
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });
});
