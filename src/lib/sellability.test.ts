import { describe, expect, it } from "vitest";
import { assessSellability, isUpcoming, upcomingBoundaryUtc } from "./sellability";

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

/**
 * Précommande (client 2026-08-20) : `preorderEnabled` lève UNIQUEMENT le
 * refus `upcoming` — jamais les règles stock/vendable, qui s'appliquent
 * ensuite exactement comme pour une fiche déjà parue.
 */
describe("assessSellability — précommande (`preorderEnabled`)", () => {
  it("à paraître + preorderEnabled + vendable + stock ok → ok (précommande ouverte)", () => {
    expect(
      assessSellability(
        { sellable: true, stock: 5, publishedAt: "2026-07-19", preorderEnabled: true },
        1,
        NOW,
      ),
    ).toEqual({ ok: true });
  });

  it("à paraître + preorderEnabled + stock non suivi → ok, quelle que soit la quantité", () => {
    expect(
      assessSellability(
        { sellable: true, stock: null, publishedAt: "2026-07-19", preorderEnabled: true },
        15,
        NOW,
      ),
    ).toEqual({ ok: true });
  });

  it("à paraître SANS preorderEnabled → refus upcoming inchangé (comportement historique)", () => {
    expect(
      assessSellability(
        { sellable: true, stock: 5, publishedAt: "2026-07-19", preorderEnabled: false },
        1,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "upcoming" });
  });

  it("à paraître + preorderEnabled MAIS non vendable (case décochée) → not-sellable, jamais un contournement total", () => {
    expect(
      assessSellability(
        { sellable: false, stock: 5, publishedAt: "2026-07-19", preorderEnabled: true },
        1,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "not-sellable" });
  });

  it("à paraître + preorderEnabled MAIS stock épuisé → out-of-stock (une précommande peut être en rupture)", () => {
    expect(
      assessSellability(
        { sellable: true, stock: 0, publishedAt: "2026-07-19", preorderEnabled: true },
        1,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "out-of-stock" });
  });

  it("à paraître + preorderEnabled MAIS stock insuffisant pour la quantité demandée → insufficient-stock", () => {
    expect(
      assessSellability(
        { sellable: true, stock: 2, publishedAt: "2026-07-19", preorderEnabled: true },
        3,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "insufficient-stock" });
  });

  it("preorderEnabled sur une fiche DÉJÀ parue → sans effet (pas à paraître, rien à lever)", () => {
    expect(
      assessSellability(
        { sellable: true, stock: 5, publishedAt: "2020-01-01", preorderEnabled: true },
        1,
        NOW,
      ),
    ).toEqual({ ok: true });
  });
});

/**
 * `upcomingBoundaryUtc` — jumeau requête d'`isUpcoming` (borne pour les
 * `where` admin sur le timestamp brut `dateParution`) : minuit Paris du
 * LENDEMAIN du jour civil français de `now`. Verrouille les deux offsets
 * (été/hiver), le passage de minuit Paris, et la cohérence avec les deux
 * conventions de stockage du picker `dayOnly` (minuit Paris d'une saisie
 * admin, minuit UTC d'un seed SQL).
 */
describe("upcomingBoundaryUtc", () => {
  it("été : minuit Paris du lendemain (UTC+2)", () => {
    expect(upcomingBoundaryUtc(new Date("2026-07-18T12:00:00Z"))).toBe("2026-07-18T22:00:00.000Z");
  });

  it("hiver : minuit Paris du lendemain (UTC+1)", () => {
    expect(upcomingBoundaryUtc(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01-15T23:00:00.000Z");
  });

  it("après minuit Paris (mais avant minuit UTC), le jour civil français a déjà tourné", () => {
    // 22h30 UTC le 18/07 = 00h30 le 19/07 à Paris → lendemain = 20/07.
    expect(upcomingBoundaryUtc(new Date("2026-07-18T22:30:00Z"))).toBe("2026-07-19T22:00:00.000Z");
  });

  it("parution du jour = parue, lendemain = à paraître — dans les DEUX conventions de stockage", () => {
    const borne = upcomingBoundaryUtc(new Date("2026-07-18T12:00:00Z"));
    // Saisie admin (minuit Paris) : 18/07 stocké « 2026-07-17T22:00Z », 19/07 stocké « 2026-07-18T22:00Z ».
    expect("2026-07-17T22:00:00.000Z" < borne).toBe(true);
    expect("2026-07-18T22:00:00.000Z" >= borne).toBe(true);
    // Seed SQL (minuit UTC) : 18/07 stocké « 2026-07-18T00:00Z », 19/07 stocké « 2026-07-19T00:00Z ».
    expect("2026-07-18T00:00:00.000Z" < borne).toBe(true);
    expect("2026-07-19T00:00:00.000Z" >= borne).toBe(true);
  });
});
