import { describe, expect, it } from "vitest";
import { deriveGauge, type GaugeFacts } from "./campaign";

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
