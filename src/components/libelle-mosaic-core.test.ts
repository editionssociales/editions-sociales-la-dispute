import { describe, expect, it } from "vitest";

import { labelSpan, tierMetrics, tierRows, truncateWords } from "./libelle-mosaic-core";

/**
 * `tierRows` : répartition en étages 1-2-3-4-4-4… — le plafond de 4 cases
 * (`MAX_TIER_CELLS`) doit se déclencher exactement à l'étage 4, jamais avant
 * ni après, et le dernier étage prend le reliquat sans jamais planter sur un
 * compte qui ne tombe pas rond.
 */
describe("tierRows", () => {
  it("pyramide 1-2-3-4 puis étages de 4 (exemple 19 libellés du commentaire)", () => {
    const items = Array.from({ length: 19 }, (_, i) => i);
    const rows = tierRows(items);
    expect(rows.map((r) => r.length)).toEqual([1, 2, 3, 4, 4, 4, 1]);
  });

  it("aucun trou : chaque item apparaît une fois, dans l'ordre", () => {
    const items = Array.from({ length: 19 }, (_, i) => i);
    const rows = tierRows(items);
    expect(rows.flat()).toEqual(items);
  });

  it("moins de 4 items : un seul étage, jamais plafonné", () => {
    expect(tierRows([1, 2, 3]).map((r) => r.length)).toEqual([1, 2]);
  });

  it("liste vide : aucun étage", () => {
    expect(tierRows([])).toEqual([]);
  });
});

/**
 * `tierMetrics` : le point fragile de la vue (cf. `src/components/CLAUDE.md`)
 * est l'ORDRE DES PENTES entre les trois métriques — l'épaisseur (`1/rang`)
 * doit décroître PLUS VITE que le corps (`1/(rang+1)`), qui doit décroître
 * PLUS VITE que le compte (`1/(rang+2)`). Un exposant remonté par erreur
 * casse cet ordre sans changer le signe de la pente — d'où des assertions
 * sur le RATIO d'un rang au suivant, pas seulement sur la décroissance.
 */
describe("tierMetrics", () => {
  it("valeurs desktop du commentaire (corps 42-40-30-24-20-17,1 px)", () => {
    expect([1, 2, 3, 4, 5, 6].map((r) => tierMetrics(r).fontLg)).toEqual([
      42, 40, 30, 24, 20, 17.1,
    ]);
  });

  it("épaisseur : hauteur automatique (null) au rang 1, sinon BASE / rang", () => {
    expect(tierMetrics(1).thickLg).toBeNull();
    expect(tierMetrics(1).thickSm).toBeNull();
    expect(tierMetrics(2).thickLg).toBe(150);
    expect(tierMetrics(3).thickLg).toBe(100);
    expect(tierMetrics(4).thickLg).toBe(75);
  });

  it("rang 1 : abattement de 30 % sur le corps ET le compte, jamais au-delà", () => {
    const tier1 = tierMetrics(1);
    const tier2 = tierMetrics(2);
    // Sans abattement le corps du rang 1 vaudrait BASE/(1+1) = 60 ; avec les
    // 30 % de moins (retour Youri 25/07), il tombe à 42.
    expect(tier1.fontLg).toBe(42);
    expect(tier1.countLg).toBe(40.3);
    // Le rang 2 n'est jamais affecté par l'abattement du rang 1.
    expect(tier2.fontLg).toBe(40);
  });

  it("ORDRE DES PENTES : épaisseur décroît plus vite que corps, corps plus vite que compte", () => {
    for (let rank = 2; rank < 6; rank++) {
      const a = tierMetrics(rank);
      const b = tierMetrics(rank + 1);
      const thickRatio = (b.thickLg as number) / (a.thickLg as number);
      const fontRatio = b.fontLg / a.fontLg;
      const countRatio = b.countLg / a.countLg;
      // Un ratio plus PETIT = une chute plus rapide (b est plus petit que a).
      expect(thickRatio).toBeLessThan(fontRatio);
      expect(fontRatio).toBeLessThan(countRatio);
      // Les trois métriques décroissent strictement (jamais un plancher).
      expect(thickRatio).toBeLessThan(1);
      expect(fontRatio).toBeLessThan(1);
      expect(countRatio).toBeLessThan(1);
    }
  });

  it("mobile (Sm) suit la même loi que desktop (Lg), à la moitié de la base", () => {
    for (let rank = 1; rank <= 6; rank++) {
      const m = tierMetrics(rank);
      expect(m.fontSm).toBe(Math.round((m.fontLg / 2) * 10) / 10);
      expect(m.countSm).toBe(Math.round((m.countLg / 2) * 10) / 10);
    }
  });
});

/**
 * `truncateWords` : jamais de coupure au milieu d'un mot, ponctuation de
 * liaison retirée en fin de coupe, mot initial déjà trop long gardé entier.
 */
describe("truncateWords", () => {
  it("sous la limite : inchangé", () => {
    expect(truncateWords("Poésie")).toBe("Poésie");
  });

  it("coupe sur une frontière de mot et retire la ponctuation de liaison finale (exemple du commentaire)", () => {
    expect(truncateWords("État, droit & institutions")).toBe("État, droit");
  });

  it("jamais un fragment au milieu d'un mot", () => {
    const result = truncateWords("Anthropologie politique et sociale contemporaine");
    for (const word of result.split(" ")) {
      expect(
        "Anthropologie politique et sociale contemporaine".includes(word),
      ).toBe(true);
    }
  });

  it("repli : un premier mot déjà plus long que la limite reste entier", () => {
    const longWord = "Anticonstitutionnellementicoco"; // > 20 caractères
    expect(truncateWords(longWord)).toBe(longWord);
  });
});

/**
 * `labelSpan` : span horizontal proportionnel à la coupure de MOT la plus
 * équilibrée sur deux lignes — jamais la longueur brute pour un libellé à
 * plusieurs mots.
 */
describe("labelSpan", () => {
  it("un seul mot : sa longueur", () => {
    expect(labelSpan("Poésie")).toBe(6);
  });

  it("deux mots : la plus longue des deux moitiés", () => {
    // "État"=4, "droit"=5 → max(4,5)=5.
    expect(labelSpan("État droit")).toBe(5);
  });

  it("plusieurs mots : le MEILLEUR point de coupure (le plus équilibré)", () => {
    // Coupures possibles de "A B C" : "A"|"B C" (1/3) ou "A B"|"C" (3/1) →
    // best = min(3, 3) = 3, jamais la longueur brute (5).
    expect(labelSpan("A B C")).toBe(3);
  });
});
