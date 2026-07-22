import { describe, expect, it, vi } from "vitest";

/**
 * `splitRencontres` est la seule partie de `rencontres.ts` testable sans
 * Payload (pure) — le découpage/tri autour d'aujourd'hui se vérifie ICI une
 * seule fois, cf. `sellability.test.ts` pour le même principe. `rencontres.ts`
 * est un module server-only (`@payload-config`/`payload`, cf. `catalogue-pg.ts`) :
 * mock minimal pour pouvoir l'importer sous vitest, même patron que
 * `catalogue-pg.test.ts` — on n'exerce jamais `getRencontres` ici.
 */
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: vi.fn() }));

const { splitRencontres } = await import("./rencontres");
type Rencontre = import("./rencontres").Rencontre;

function event(id: number, date: string): Rencontre {
  return {
    id,
    titre: `Rencontre ${id}`,
    date,
    lieu: "Librairie",
    ville: "Ville",
    description: "Description.",
    image: null,
    livre: null,
  };
}

describe("splitRencontres", () => {
  it("aujourd'hui même compte comme à venir (>=), pas comme passé", () => {
    const events = [event(1, "2026-07-22")];
    expect(splitRencontres(events, "2026-07-22")).toEqual({
      aVenir: [event(1, "2026-07-22")],
      passees: [],
    });
  });

  it("liste vide → deux listes vides", () => {
    expect(splitRencontres([], "2026-07-22")).toEqual({ aVenir: [], passees: [] });
  });

  it("à venir triées en ordre ASCENDANT (la plus proche d'abord)", () => {
    const events = [event(1, "2026-08-01"), event(2, "2026-07-25"), event(3, "2026-12-31")];
    const { aVenir } = splitRencontres(events, "2026-07-22");
    expect(aVenir.map((e) => e.id)).toEqual([2, 1, 3]);
  });

  it("passées triées en ordre DESCENDANT (la plus récente d'abord)", () => {
    const events = [event(1, "2026-01-01"), event(2, "2026-06-30"), event(3, "2025-12-25")];
    const { passees } = splitRencontres(events, "2026-07-22");
    expect(passees.map((e) => e.id)).toEqual([2, 1, 3]);
  });

  it("mélange à venir/passées : chaque événement va dans la bonne liste", () => {
    const events = [
      event(1, "2026-07-21"), // passée (hier)
      event(2, "2026-07-22"), // à venir (aujourd'hui)
      event(3, "2026-07-23"), // à venir (demain)
      event(4, "2020-01-01"), // passée (loin)
    ];
    const { aVenir, passees } = splitRencontres(events, "2026-07-22");
    expect(aVenir.map((e) => e.id)).toEqual([2, 3]);
    expect(passees.map((e) => e.id)).toEqual([1, 4]);
  });
});
