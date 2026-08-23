import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOUVEAUTES_COVER_SIZES_CENTER,
  NOUVEAUTES_COVER_SIZES_SIDE,
  NOUVEAUTES_RAIL_ID,
  nouveautesBootstrapScript,
  nouveautesCoverSizes,
  nouveautesInitialIndex,
} from "./nouveautes-carousel-lcp";

describe("nouveautesInitialIndex — LCP du rail (issue #109)", () => {
  it("centre le 2e livre dès qu'il y en a au moins deux, sinon le premier", () => {
    expect(nouveautesInitialIndex(0)).toBe(0);
    expect(nouveautesInitialIndex(1)).toBe(0);
    expect(nouveautesInitialIndex(2)).toBe(1);
    expect(nouveautesInitialIndex(8)).toBe(1);
  });
});

describe("nouveautesCoverSizes", () => {
  it("donne le sizes large à la carte initialement centrée, le serré aux autres", () => {
    const initial = nouveautesInitialIndex(4);
    expect(initial).toBe(1);
    expect(nouveautesCoverSizes(1, initial)).toBe(NOUVEAUTES_COVER_SIZES_CENTER);
    expect(nouveautesCoverSizes(0, initial)).toBe(NOUVEAUTES_COVER_SIZES_SIDE);
    expect(nouveautesCoverSizes(2, initial)).toBe(NOUVEAUTES_COVER_SIZES_SIDE);
  });

  it("garde un vw mobile pour borner le srcset Next, assez serré pour 256w en LH mobile", () => {
    expect(NOUVEAUTES_COVER_SIZES_CENTER).toMatch(/32vw/);
    expect(NOUVEAUTES_COVER_SIZES_CENTER).not.toMatch(/42vw/);
    expect(NOUVEAUTES_COVER_SIZES_SIDE).toMatch(/16vw/);
  });
});

describe("nouveautesBootstrapScript", () => {
  it("cible le rail et l'index LCP, JS évaluable", () => {
    const src = nouveautesBootstrapScript(1);
    expect(src).toContain(NOUVEAUTES_RAIL_ID);
    expect(src).toContain("[data-card]");
    expect(src).toMatch(/,1\)\s*$/);
    expect(() => new Function(src)).not.toThrow();
  });

  it("refuse un index non fini (repli 0) plutôt que d'interpoler NaN", () => {
    expect(nouveautesBootstrapScript(Number.NaN)).toMatch(/,0\)\s*$/);
  });
});

describe("câblage Cover du carrousel", () => {
  it("précharge l'index centré, pas l'index 0, et bootstrap le centrage avant paint", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/nouveautes-carousel.tsx"),
      "utf8",
    );
    expect(src).toContain("preload={i === initialIndex}");
    expect(src).not.toContain("preload={i === 0}");
    expect(src).toContain("nouveautesCoverSizes(i, initialIndex)");
    expect(src).toContain("nouveautesBootstrapScript(initialIndex)");
    expect(src).toContain("NOUVEAUTES_RAIL_ID");
    expect(src).toContain("scale-[1.12]");
  });
});
