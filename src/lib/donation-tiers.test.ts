import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_2026_GOAL,
  CAMPAIGN_2026_PALIERS,
  CAMPAIGN_KEY,
  DONATION_TIERS,
  FREE_AMOUNT,
  deriveCampaign2026,
  parseDonation,
} from "./donation-tiers";

describe("CAMPAIGN_KEY", () => {
  it("vaut « souscription-2026 »", () => {
    expect(CAMPAIGN_KEY).toBe("souscription-2026");
  });
});

describe("DONATION_TIERS", () => {
  it("10 paliers : 8 contreparties physiques + 2 mécènes sans envoi", () => {
    expect(DONATION_TIERS).toHaveLength(10);
    expect(DONATION_TIERS.filter((t) => t.physical)).toHaveLength(8);
    expect(DONATION_TIERS.filter((t) => !t.physical)).toHaveLength(2);
  });

  it("ids uniques", () => {
    const ids = DONATION_TIERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("montants tous positifs, mécènes = 500 et 1000 €", () => {
    for (const t of DONATION_TIERS) expect(t.amount).toBeGreaterThan(0);
    const mecenes = DONATION_TIERS.filter((t) => !t.physical).map((t) => t.amount);
    expect(mecenes.sort((a, b) => a - b)).toEqual([500, 1000]);
  });
});

describe("parseDonation — palier", () => {
  it("tierId valide dérive le montant de la table (jamais du client)", () => {
    const result = parseDonation({ tierId: "palier-50" });
    expect(result).toMatchObject({ amountMinor: 5000, tier: { id: "palier-50", amount: 50 } });
  });

  it("tierId inconnu → erreur", () => {
    const result = parseDonation({ tierId: "palier-999" });
    expect(result).toHaveProperty("error");
  });

  it("un montant client fourni avec un tierId valide est ignoré", () => {
    const result = parseDonation({ tierId: "palier-50", amount: "1" });
    expect(result).toMatchObject({ amountMinor: 5000 });
  });
});

describe("parseDonation — montant libre", () => {
  it("montant borné valide → centimes, pas de tier", () => {
    const result = parseDonation({ amount: "20" });
    expect(result).toMatchObject({ amountMinor: 2000 });
    expect(result).not.toHaveProperty("tier");
  });

  it("virgule décimale acceptée", () => {
    const result = parseDonation({ amount: "23,50" });
    expect(result).toMatchObject({ amountMinor: 2350 });
  });

  it("sous le minimum → refusé", () => {
    const result = parseDonation({ amount: "2" });
    expect(result).toHaveProperty("error");
  });

  it("au-dessus du maximum → refusé", () => {
    const result = parseDonation({ amount: "10001" });
    expect(result).toHaveProperty("error");
  });

  it("bornes incluses (min et max acceptés)", () => {
    expect(parseDonation({ amount: String(FREE_AMOUNT.min) })).toMatchObject({
      amountMinor: FREE_AMOUNT.min * 100,
    });
    expect(parseDonation({ amount: String(FREE_AMOUNT.max) })).toMatchObject({
      amountMinor: FREE_AMOUNT.max * 100,
    });
  });

  it("négatif → refusé", () => {
    const result = parseDonation({ amount: "-5" });
    expect(result).toHaveProperty("error");
  });

  it("NaN (texte non numérique) → refusé", () => {
    const result = parseDonation({ amount: "abc" });
    expect(result).toHaveProperty("error");
  });

  it("ni tierId ni amount → refusé", () => {
    const result = parseDonation({});
    expect(result).toHaveProperty("error");
  });
});

describe("deriveCampaign2026", () => {
  it("n'expose pas `stats` (piège du gabarit 2024)", () => {
    const c = deriveCampaign2026({ collected: 10000, contributors: 42 });
    expect(c).not.toHaveProperty("stats");
    // @ts-expect-error — le type de retour interdit statiquement l'accès à `stats`.
    expect(c.stats).toBeUndefined();
  });

  it("expose gauge/collected/contributors/percentOfGoal, dérivés de l'objectif 2026", () => {
    const c = deriveCampaign2026({ collected: 25000, contributors: 10 });
    expect(c.collected).toBe(25000);
    expect(c.contributors).toBe(10);
    expect(c.percentOfGoal).toBe(Math.floor((25000 / CAMPAIGN_2026_GOAL) * 100));
    expect(c.gauge.max).toBe(Math.max(...CAMPAIGN_2026_PALIERS.map((p) => p.value)));
  });

  it("marqueurs de jauge atteints selon le collecté", () => {
    const c = deriveCampaign2026({ collected: 60000, contributors: 1 });
    expect(c.gauge.markers.map((m) => m.reached)).toEqual([true, false, false]);
  });
});
