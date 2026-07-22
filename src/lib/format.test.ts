import { describe, expect, it } from "vitest";

import { isoDayParis } from "./format";

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
