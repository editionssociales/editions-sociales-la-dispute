import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOUVEAUTES_COVER_SIZES_CENTER,
  NOUVEAUTES_COVER_SIZES_SIDE,
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
});

describe("câblage Cover du carrousel", () => {
  it("précharge l'index centré, pas l'index 0", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/nouveautes-carousel.tsx"),
      "utf8",
    );
    expect(src).toContain("preload={i === initialIndex}");
    expect(src).not.toContain("preload={i === 0}");
    expect(src).toContain("nouveautesCoverSizes(i, initialIndex)");
  });
});
