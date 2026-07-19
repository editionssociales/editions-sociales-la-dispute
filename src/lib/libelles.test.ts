import { describe, expect, it } from "vitest";
import {
  LEGACY_COLLECTION_TO_LIBELLE,
  LIBELLES_MAJEURS,
  resolveLibelleSlug,
} from "./libelles";

describe("LIBELLES_MAJEURS", () => {
  it("compte une première liste d'environ 15–20 libellés, slugs uniques", () => {
    expect(LIBELLES_MAJEURS.length).toBeGreaterThanOrEqual(15);
    expect(LIBELLES_MAJEURS.length).toBeLessThanOrEqual(20);
    const slugs = LIBELLES_MAJEURS.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("conserve GEME (nav + marque)", () => {
    expect(LIBELLES_MAJEURS.some((l) => l.slug === "geme")).toBe(true);
  });
});

describe("resolveLibelleSlug", () => {
  it("passe un slug de libellé tel quel", () => {
    expect(resolveLibelleSlug("travail-salariat")).toBe("travail-salariat");
  });

  it("mappe les anciens slugs de collection", () => {
    expect(resolveLibelleSlug("le-genre-du-monde")).toBe("genre-sexualites");
    expect(resolveLibelleSlug("les-propedeutiques")).toBe("introduction");
    expect(resolveLibelleSlug("geme")).toBe("geme");
  });

  it("écarte hors-collection et les valeurs vides", () => {
    expect(resolveLibelleSlug("hors-collection")).toBeUndefined();
    expect(resolveLibelleSlug("")).toBeUndefined();
    expect(resolveLibelleSlug(null)).toBeUndefined();
  });

  it("chaque entrée legacy pointe vers un libellé majeur existant", () => {
    const major = new Set(LIBELLES_MAJEURS.map((l) => l.slug));
    for (const target of Object.values(LEGACY_COLLECTION_TO_LIBELLE)) {
      expect(major.has(target)).toBe(true);
    }
  });
});
