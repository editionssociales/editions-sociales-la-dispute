import { describe, expect, it } from "vitest";
import { CAMPAIGN_2024, deriveCampaign, type CampaignFacts } from "./campaign";

const facts = (over: Partial<CampaignFacts> = {}): CampaignFacts => ({
  collected: 30000,
  goal: 50000,
  contributors: 100,
  messages: 10,
  durationDays: 20,
  paliers: [
    { value: 25000, label: "A" },
    { value: 50000, label: "B" },
  ],
  ...over,
});

describe("deriveCampaign", () => {
  it("plafond de jauge = dernier (plus haut) palier", () => {
    expect(deriveCampaign(facts()).gauge.max).toBe(50000);
  });

  it("pourcentage de l'objectif planché (jamais arrondi au-dessus)", () => {
    // 30000 / 50000 = 60 %
    expect(deriveCampaign(facts()).percentOfGoal).toBe(60);
    // 85305 / 50000 = 170.61 % → planché à 170, pas 171
    expect(deriveCampaign(facts({ collected: 85305 })).percentOfGoal).toBe(170);
  });

  it("palier atteint dès que collecté ≥ palier (limite incluse)", () => {
    const c = deriveCampaign(facts({ collected: 25000 }));
    expect(c.gauge.markers.map((m) => m.reached)).toEqual([true, false]);
  });

  it("expose 4 tuiles de stats, dont le pourcentage dérivé", () => {
    const c = deriveCampaign(facts({ collected: 30000 }));
    expect(c.stats).toHaveLength(4);
    expect(c.stats[2]).toMatchObject({ value: 60, suffix: " %" });
    expect(c.stats[0].label).toContain("20 jours");
  });
});

describe("CAMPAIGN_2024 (résultats réels)", () => {
  it("dérive 170 %, plafond 100 000 €, deux paliers franchis sur trois", () => {
    expect(CAMPAIGN_2024.percentOfGoal).toBe(170);
    expect(CAMPAIGN_2024.gauge.max).toBe(100000);
    expect(CAMPAIGN_2024.gauge.value).toBe(85305);
    expect(CAMPAIGN_2024.gauge.markers.map((m) => m.reached)).toEqual([true, true, false]);
  });
});
