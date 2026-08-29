import { describe, expect, it } from "vitest";

import {
  estimatedLines,
  labelSpan,
  tierMetrics,
  tierRows,
  truncateWords,
} from "./libelle-mosaic-core";

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

/**
 * `tierMetrics` : depuis le retour client du 29/08, le corps d'un étage n'est
 * plus une fonction du RANG de popularité mais du CONTENU réel de la
 * rangée — nombre de cases et largeur du libellé le plus exigeant
 * (`labelSpan`). Point fragile : que le corps choisi laisse TOUJOURS tenir
 * chaque libellé dans le budget de lignes (`estimatedLines`), jamais
 * l'inverse.
 */
describe("tierMetrics", () => {
  it("dépend du CONTENU, pas de la position : deux rangées de même forme mais de libellés différents donnent des corps différents", () => {
    const courts = tierMetrics(["Essais", "Poésie"]);
    const longs = tierMetrics(["Anthropologie politique", "Économie politique"]);
    expect(longs.fontLg).toBeLessThan(courts.fontLg);
  });

  it("une seule case sur sa rangée (bannière) obtient un corps plus grand qu'à plusieurs cases, à libellé égal", () => {
    const seule = tierMetrics(["Histoire"]);
    const partagee = tierMetrics(["Histoire", "Histoire", "Histoire", "Histoire"]);
    expect(seule.fontLg).toBeGreaterThan(partagee.fontLg);
  });

  it("mobile (Sm) suit la même loi que desktop (Lg), à la moitié de la base", () => {
    const rows = [
      ["Tous les livres"],
      ["Essais", "Poésie"],
      ["Anthropologie politique", "Économie", "Histoire", "Droit"],
    ];
    for (const labels of rows) {
      const m = tierMetrics(labels);
      // Chaque corps est arrondi (`floor1`) depuis sa PROPRE base — Sm peut
      // donc différer de Lg/2 d'un pas d'arrondi, jamais plus.
      expect(Math.abs(m.fontSm - m.fontLg / 2)).toBeLessThan(0.1);
    }
  });

  it("INVARIANT : à chaque étage, le libellé le plus exigeant tient dans le budget de lignes au corps calculé (jamais tronqué)", () => {
    // Rangées réalistes (1 à 4 cases), mêlant libellés courts et longs — y
    // compris le plus long déjà rencontré dans ce module (`truncateWords`).
    const rows: string[][] = [
      ["Tous les livres"],
      ["Essais"],
      ["Essais", "Poésie"],
      ["Histoire", "Philosophie", "Économie"],
      [
        "Anthropologie politique et sociale contemporaine",
        "Théorie critique",
        "Marxisme",
        "Écologie politique",
      ],
    ];
    const MAX_LINES = 2;
    for (const labels of rows) {
      const { fontLg, fontSm } = tierMetrics(labels);
      const worst = labels.reduce(
        (acc, label) => (labelSpan(label) > labelSpan(acc) ? label : acc),
        labels[0],
      );
      expect(estimatedLines(worst, fontLg, labels.length)).toBeLessThanOrEqual(MAX_LINES);
      expect(estimatedLines(worst, fontSm, labels.length)).toBeLessThanOrEqual(MAX_LINES);
    }
  });
});

/**
 * `truncateWords` : garde-fou d'un mot DÉGÉNÉRÉ, jamais atteint par un
 * intitulé éditorial normal (plafond relevé 20 → 60 le 29/08 : la troncature
 * ne porte plus sur le texte visible d'un libellé ordinaire).
 */
describe("truncateWords", () => {
  it("sous la limite : inchangé", () => {
    expect(truncateWords("Poésie")).toBe("Poésie");
  });

  it("un libellé multi-mots de longueur normale reste ENTIER (ne se tronque plus à l'affichage)", () => {
    const label = "Anthropologie politique et sociale contemporaine";
    expect(truncateWords(label)).toBe(label);
  });

  it("coupe sur une frontière de mot et retire la ponctuation de liaison finale, au-delà du plafond dégénéré", () => {
    const degenere =
      "État, droit, institutions, pouvoir, société et transformations contemporaines & au-delà";
    const result = truncateWords(degenere);
    expect(result.length).toBeLessThan(degenere.length);
    expect(degenere.startsWith(result.replace(/[\s,&·–-]+$/u, ""))).toBe(true);
  });

  it("jamais un fragment au milieu d'un mot", () => {
    const degenere =
      "État, droit, institutions, pouvoir, société et transformations contemporaines & au-delà";
    const result = truncateWords(degenere);
    for (const word of result.split(" ")) {
      expect(degenere.includes(word)).toBe(true);
    }
  });

  it("repli : un premier mot déjà plus long que la limite reste entier", () => {
    const longWord = "A".repeat(70); // > 60 caractères
    expect(truncateWords(longWord)).toBe(longWord);
  });
});
