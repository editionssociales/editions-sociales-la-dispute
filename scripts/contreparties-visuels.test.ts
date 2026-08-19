import { describe, expect, it } from "vitest";
import { darkFrameRun } from "./contreparties-visuels.mjs";

/**
 * `darkFrameRun` décide seule ce que le script rogne au bord des visuels
 * livrés : les cas ci-dessous sont les deux artefacts réellement rencontrés
 * (8 colonnes noires nettes à gauche de « camarade d'honneur » en août,
 * 6 lignes noires + barbe grise en haut de « camarade pour la vie » en
 * juillet) et les gardes-fous qui empêchent de manger du contenu.
 */
describe("darkFrameRun", () => {
  it("ne rogne rien quand le bord est déjà blanc", () => {
    expect(darkFrameRun([255, 255, 255, 255])).toBe(0);
  });

  it("rogne une bande noire nette (cas « camarade d'honneur », 8 colonnes)", () => {
    expect(darkFrameRun([...Array(8).fill(0), 255, 255, 255])).toBe(8);
  });

  it("rogne la barbe grise qui suit la bande (cas « camarade pour la vie »)", () => {
    expect(darkFrameRun([...Array(6).fill(0), 191, 255, 255])).toBe(7);
  });

  it("s'arrête dès que le blanc revient dans la ligne", () => {
    expect(darkFrameRun([0, 0, 255, 100, 100])).toBe(2);
  });

  it("ne rogne pas une ligne de contenu sombre non collée au bord", () => {
    // Un montage à fond blanc : la première ligne remonte toujours à 255.
    expect(darkFrameRun([255, 0, 0, 0, 0])).toBe(0);
  });

  it("plafonne la barbe (une image entièrement grise ne se fait pas dévorer)", () => {
    expect(darkFrameRun([0, ...Array(40).fill(200)], { maxFade: 3 })).toBe(4);
  });

  it("plafonne le rognage total (garde-fou de bord)", () => {
    expect(darkFrameRun(Array(200).fill(0), { max: 64 })).toBe(64);
  });
});
