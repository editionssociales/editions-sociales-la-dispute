import { describe, expect, it } from "vitest";
import {
  assertCatalogueComplete,
  CATALOGUE_SIZE_TOLERANCE,
  CatalogueTruncatedError,
  KNOWN_CATALOGUE_SIZE,
} from "./catalogue-integrity";

/**
 * Garde-fou §5 (DEVOPS.md) — logique de seuil en isolation, sans passer par
 * `catalogue.ts` (le câblage réel, sources http/pg substituées, est vérifié
 * dans `catalogue.test.ts`).
 */

describe("assertCatalogueComplete", () => {
  it("compte égal au dernier chiffre connu → ne jette pas", () => {
    expect(() => assertCatalogueComplete(KNOWN_CATALOGUE_SIZE)).not.toThrow();
  });

  it("dérive normale (nouvelles parutions) sous la tolérance → ne jette pas", () => {
    expect(() => assertCatalogueComplete(KNOWN_CATALOGUE_SIZE + 5)).not.toThrow();
    expect(() => assertCatalogueComplete(KNOWN_CATALOGUE_SIZE - 5)).not.toThrow();
  });

  it("chute > 5% (page WordPress en échec pendant le build) → jette CatalogueTruncatedError", () => {
    expect(() => assertCatalogueComplete(200)).toThrow(CatalogueTruncatedError);
  });

  it("hausse > 5% (anomalie symétrique — doublons, mauvaise pagination) → jette aussi", () => {
    expect(() => assertCatalogueComplete(400)).toThrow(CatalogueTruncatedError);
  });

  it("message explicite : compte, référence et écart en clair (logs de build)", () => {
    try {
      assertCatalogueComplete(0);
      expect.fail("aurait dû jeter");
    } catch (err) {
      expect(err).toBeInstanceOf(CatalogueTruncatedError);
      const message = (err as Error).message;
      expect(message).toContain("0 livres collectés");
      expect(message).toContain(String(KNOWN_CATALOGUE_SIZE));
      expect(message).toContain("5%");
    }
  });

  it("référence ajustable : un `known` différent déplace la fenêtre tolérée", () => {
    expect(() => assertCatalogueComplete(104, 100)).not.toThrow(); // +4%
    expect(() => assertCatalogueComplete(106, 100)).toThrow(CatalogueTruncatedError); // +6%
  });

  it("tolérance ajustable indépendamment de la constante par défaut", () => {
    expect(() => assertCatalogueComplete(150, 100, 0.6)).not.toThrow(); // +50% toléré à 60%
    expect(() => assertCatalogueComplete(150, 100, 0.4)).toThrow(CatalogueTruncatedError); // +50% refusé à 40%
  });

  it("référence <= 0 → garde-fou désactivé (pas de division par zéro, pas de faux positif)", () => {
    expect(() => assertCatalogueComplete(0, 0)).not.toThrow();
    expect(() => assertCatalogueComplete(1000, -1)).not.toThrow();
  });

  it("la constante exportée reste le dernier chiffre documenté (DEVOPS.md §1.3/§5)", () => {
    expect(KNOWN_CATALOGUE_SIZE).toBe(295);
    expect(CATALOGUE_SIZE_TOLERANCE).toBe(0.05);
  });
});
