import { describe, expect, it } from "vitest";
import { assessSellability, isUpcoming } from "./sellability";

/**
 * L'invariant « upcoming prime toujours » et la sémantique du stock
 * (`null` = non suivi, `0` = épuisé, plancher strict contre `qty`) se
 * vérifient ICI une seule fois — `catalogue-core.test.ts` et
 * `checkout-core.test.ts` ne testent plus que la traduction du verdict
 * (statut d'achat, refus motivé).
 */

const NOW = new Date("2026-07-18T12:00:00Z");

const SELLABLE = { sellable: true, stock: null, publishedAt: null };

describe("isUpcoming", () => {
  it("parution future → à paraître ; passée ou du jour → non", () => {
    expect(isUpcoming("2026-07-19", NOW)).toBe(true);
    expect(isUpcoming("2026-07-18", NOW)).toBe(false);
    expect(isUpcoming("2020-01-01", NOW)).toBe(false);
  });

  it("parution inconnue (null) → jamais à paraître", () => {
    expect(isUpcoming(null, NOW)).toBe(false);
  });
});

describe("assessSellability", () => {
  it("à paraître PRIME sur tout — même vendable avec du stock en préparation", () => {
    expect(
      assessSellability({ sellable: true, stock: 12, publishedAt: "2026-07-19" }, 1, NOW),
    ).toEqual({ ok: false, reason: "upcoming" });
    expect(
      assessSellability({ sellable: false, stock: 0, publishedAt: "2026-07-19" }, 1, NOW),
    ).toEqual({ ok: false, reason: "upcoming" });
  });

  it("non vendable (case décochée) → not-sellable, avant toute question de stock", () => {
    expect(assessSellability({ sellable: false, stock: 5, publishedAt: null }, 1, NOW)).toEqual({
      ok: false,
      reason: "not-sellable",
    });
  });

  it("stock non suivi (null) = disponible, quelle que soit la quantité", () => {
    expect(assessSellability(SELLABLE, 1, NOW)).toEqual({ ok: true });
    expect(assessSellability(SELLABLE, 15, NOW)).toEqual({ ok: true });
  });

  it("stock 0 (ou négatif, défensif) → épuisé", () => {
    expect(assessSellability({ ...SELLABLE, stock: 0 }, 1, NOW)).toEqual({
      ok: false,
      reason: "out-of-stock",
    });
    expect(assessSellability({ ...SELLABLE, stock: -1 }, 1, NOW)).toEqual({
      ok: false,
      reason: "out-of-stock",
    });
  });

  it("plancher STRICT contre la quantité demandée : stock < qty → insufficient-stock", () => {
    expect(assessSellability({ ...SELLABLE, stock: 2 }, 3, NOW)).toEqual({
      ok: false,
      reason: "insufficient-stock",
    });
    expect(assessSellability({ ...SELLABLE, stock: 3 }, 3, NOW)).toEqual({ ok: true });
  });

  it("qty par défaut = 1 (la question du catalogue) : stock 1 → vendable", () => {
    expect(assessSellability({ ...SELLABLE, stock: 1 }, undefined, NOW)).toEqual({ ok: true });
  });
});
