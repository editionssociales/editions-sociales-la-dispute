import { describe, expect, it } from "vitest";

import { isoDayParis, parisMidnightUtc } from "./format";

/**
 * `isoDayParis` ramène un instant au jour civil français — verrouille les
 * DEUX conventions de stockage d'une date `dayOnly` Payload (cf. commentaire
 * dans `format.ts`) : minuit UTC (seed SQL) et minuit Paris stocké en UTC
 * (saisie admin depuis la France, 22h/23h UTC la veille).
 */
describe("isoDayParis", () => {
  it("minuit UTC (seed SQL) → même jour", () => {
    expect(isoDayParis("2026-06-23T00:00:00.000Z")).toBe("2026-06-23");
  });

  it("minuit Paris été stocké en UTC (22h la veille) → jour saisi, pas la veille", () => {
    expect(isoDayParis("2026-06-22T22:00:00.000Z")).toBe("2026-06-23");
  });

  it("minuit Paris hiver stocké en UTC (23h la veille) → jour saisi", () => {
    expect(isoDayParis("2026-01-14T23:00:00.000Z")).toBe("2026-01-15");
  });

  it("instant invalide → null", () => {
    expect(isoDayParis("pas-une-date")).toBeNull();
  });
});

/**
 * `parisMidnightUtc` — inverse d'`isoDayParis` (jour → instant). Verrouille
 * les deux offsets (été/hiver) et la propriété qui motive son existence :
 * une rencontre saisie le jour J dans l'admin (minuit Paris, stocké en UTC
 * la veille) doit rester « à venir » à sa propre borne, et basculer
 * « passée » à la borne du jour suivant.
 */
describe("parisMidnightUtc", () => {
  it("jour d'été (UTC+2) → minuit Paris = 22h UTC la veille", () => {
    expect(parisMidnightUtc("2026-06-23")).toBe("2026-06-22T22:00:00.000Z");
  });

  it("jour d'hiver (UTC+1) → minuit Paris = 23h UTC la veille", () => {
    expect(parisMidnightUtc("2026-01-15")).toBe("2026-01-14T23:00:00.000Z");
  });

  it("rencontre saisie le jour J (veille 22h UTC, été) : >= borne(J), < borne(J+1)", () => {
    const saisieAdminJourJ = new Date("2026-06-22T22:00:00.000Z").getTime();
    const borneJ = new Date(parisMidnightUtc("2026-06-23")).getTime();
    const borneJPlus1 = new Date(parisMidnightUtc("2026-06-24")).getTime();
    expect(saisieAdminJourJ).toBeGreaterThanOrEqual(borneJ);
    expect(saisieAdminJourJ).toBeLessThan(borneJPlus1);
  });
});
