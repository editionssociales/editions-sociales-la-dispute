import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_2024,
  deriveGauge,
  deriveStats,
  type CampaignFacts,
  type GaugeFacts,
} from "./campaign";

const gaugeFacts = (over: Partial<GaugeFacts> = {}): GaugeFacts => ({
  collected: 30000,
  goal: 50000,
  contributors: 100,
  paliers: [
    { value: 25000, label: "A" },
    { value: 50000, label: "B" },
  ],
  ...over,
});

const facts = (over: Partial<CampaignFacts> = {}): CampaignFacts => ({
  ...gaugeFacts(),
  messages: 10,
  durationDays: 20,
  ...over,
});

describe("deriveGauge", () => {
  it("plafond de jauge = dernier (plus haut) palier", () => {
    expect(deriveGauge(gaugeFacts()).gauge.max).toBe(50000);
  });

  it("pourcentage de l'objectif planché (jamais arrondi au-dessus)", () => {
    // 30000 / 50000 = 60 %
    expect(deriveGauge(gaugeFacts()).percentOfGoal).toBe(60);
    // 85305 / 50000 = 170.61 % → planché à 170, pas 171
    expect(deriveGauge(gaugeFacts({ collected: 85305 })).percentOfGoal).toBe(170);
  });

  it("palier atteint dès que collecté ≥ palier (limite incluse)", () => {
    const c = deriveGauge(gaugeFacts({ collected: 25000 }));
    expect(c.gauge.markers.map((m) => m.reached)).toEqual([true, false]);
  });

  it("ne réclame ni messages ni durée — dérivable pour une campagne en cours", () => {
    const c = deriveGauge(gaugeFacts());
    expect(c).not.toHaveProperty("stats");
    expect(c).not.toHaveProperty("messages");
  });
});

describe("deriveStats (rétrospective — campagne terminée uniquement)", () => {
  it("expose 4 tuiles, dont le pourcentage dérivé et la durée réelle", () => {
    const stats = deriveStats(facts());
    expect(stats).toHaveLength(4);
    expect(stats[2]).toMatchObject({ value: 60, suffix: " %" });
    expect(stats[0].label).toContain("20 jours");
    expect(stats[3]).toMatchObject({ value: 10, label: "messages de soutien" });
  });
});

describe("CAMPAIGN_2024 (résultats réels)", () => {
  it("dérive 170 %, plafond 100 000 €, deux paliers franchis sur trois", () => {
    expect(CAMPAIGN_2024.percentOfGoal).toBe(170);
    expect(CAMPAIGN_2024.gauge.max).toBe(100000);
    expect(CAMPAIGN_2024.gauge.value).toBe(85305);
    expect(CAMPAIGN_2024.gauge.markers.map((m) => m.reached)).toEqual([true, true, false]);
    expect(CAMPAIGN_2024.stats).toHaveLength(4);
  });
});
