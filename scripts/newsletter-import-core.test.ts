import { describe, expect, it } from "vitest";
import {
  EXPECTED_CSV_HEADER,
  countCsvRows,
  hasExpectedHeader,
  parseCsvHeader,
} from "./newsletter-import-core.mjs";

describe("parseCsvHeader / hasExpectedHeader", () => {
  it("reconnaît l'en-tête exact produit par newsletter-export.mjs", () => {
    const content = `${EXPECTED_CSV_HEADER}\ntest@exemple.fr;Jean;Dupont;2020-10-20;;import-wp-2020-10\n`;
    expect(parseCsvHeader(content)).toBe(EXPECTED_CSV_HEADER);
    expect(hasExpectedHeader(content)).toBe(true);
  });

  it("rejette un en-tête différent (délimiteur, ordre, colonnes)", () => {
    expect(hasExpectedHeader("EMAIL,PRENOM,NOM\ntest@exemple.fr,Jean,Dupont\n")).toBe(false);
  });

  it("fichier vide → en-tête vide, non conforme", () => {
    expect(hasExpectedHeader("")).toBe(false);
  });
});

describe("countCsvRows", () => {
  it("compte les lignes hors en-tête", () => {
    const content = `${EXPECTED_CSV_HEADER}\na@exemple.fr;;;;;x\nb@exemple.fr;;;;;x\n`;
    expect(countCsvRows(content)).toBe(2);
  });

  it("en-tête seul → 0", () => {
    expect(countCsvRows(`${EXPECTED_CSV_HEADER}\n`)).toBe(0);
  });

  it("ignore les lignes vides finales", () => {
    const content = `${EXPECTED_CSV_HEADER}\na@exemple.fr;;;;;x\n\n\n`;
    expect(countCsvRows(content)).toBe(1);
  });
});
