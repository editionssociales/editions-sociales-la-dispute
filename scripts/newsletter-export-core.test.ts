import { describe, expect, it } from "vitest";
import {
  CSV_HEADER,
  SOURCE_ATTRIBUTE,
  csvField,
  isValidEmail,
  normalizeRows,
  segmentRows,
  toCsv,
  toDateOnly,
} from "./newsletter-export-core.mjs";

describe("isValidEmail", () => {
  it("accepte un email syntaxiquement valide", () => {
    expect(isValidEmail("test@exemple.fr")).toBe(true);
  });

  it("rejette une chaîne sans arobase / sans domaine", () => {
    expect(isValidEmail("pas-un-email")).toBe(false);
    expect(isValidEmail("test@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("toDateOnly", () => {
  it("formate une Date en YYYY-MM-DD", () => {
    expect(toDateOnly(new Date("2020-10-20T14:32:00Z"))).toBe("2020-10-20");
  });

  it("accepte une chaîne de date MySQL", () => {
    expect(toDateOnly("2020-10-21 09:00:00")).toBe("2020-10-21");
  });

  it("null/undefined/invalide → chaîne vide", () => {
    expect(toDateOnly(null)).toBe("");
    expect(toDateOnly(undefined)).toBe("");
    expect(toDateOnly("pas-une-date")).toBe("");
  });
});

describe("csvField", () => {
  it("laisse une valeur simple telle quelle", () => {
    expect(csvField("Jean")).toBe("Jean");
  });

  it("échappe un champ contenant le délimiteur `;`", () => {
    expect(csvField("Dupont; Jean")).toBe('"Dupont; Jean"');
  });

  it("échappe et double les guillemets internes", () => {
    expect(csvField('Le "Capital"')).toBe('"Le ""Capital"""');
  });

  it("null/undefined → chaîne vide", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it.each([
    ["=SUM(A1:A9)", "'=SUM(A1:A9)"],
    ["+1+1", "'+1+1"],
    ["-1+1", "'-1+1"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\tformule", "'\tformule"],
    ["\rformule", "'\rformule"],
  ])(
    "neutralise une injection de formule (OWASP) — préfixe %j d'une apostrophe",
    (input, expected) => {
      expect(csvField(input)).toBe(expected);
    },
  );

  it("ne préfixe pas un tiret qui n'est pas en tête de chaîne", () => {
    expect(csvField("Jean-Pierre")).toBe("Jean-Pierre");
  });

  it("combine neutralisation de formule ET échappement CSV standard si la valeur contient aussi le délimiteur", () => {
    expect(csvField("=A1;B1")).toBe('"\'=A1;B1"');
  });
});

describe("normalizeRows", () => {
  const base = { status: "C", created: "2020-10-20", ip: "", list_1: 1, list_2: 0 };

  it("trim + minuscule l'email", () => {
    const { clean } = normalizeRows([{ ...base, email: "  Test@Exemple.FR  " }]);
    expect(clean).toHaveLength(1);
    expect(clean[0].email).toBe("test@exemple.fr");
  });

  it("écarte les emails syntaxiquement invalides (rapportés séparément)", () => {
    const { clean, invalid } = normalizeRows([{ ...base, email: "pas-un-email" }]);
    expect(clean).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it("écarte les emails vides", () => {
    const { clean, invalid } = normalizeRows([{ ...base, email: "" }]);
    expect(clean).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it("détecte un doublon d'email AU SEIN de la requête SQL, garde la première occurrence", () => {
    const { clean, duplicates } = normalizeRows([
      { ...base, email: "dup@exemple.fr", name: "Premier" },
      { ...base, email: "DUP@exemple.fr", name: "Second" },
    ]);
    expect(clean).toHaveLength(1);
    expect(clean[0].name).toBe("Premier");
    expect(duplicates).toEqual(["dup@exemple.fr"]);
  });

  it("un email dans list_1 ET list_2 n'est PAS un doublon (une seule ligne SQL, deux appartenances)", () => {
    const { clean, duplicates } = normalizeRows([
      { ...base, email: "les-deux@exemple.fr", list_1: 1, list_2: 1 },
    ]);
    expect(clean).toHaveLength(1);
    expect(duplicates).toHaveLength(0);
  });
});

interface TestRow {
  email: string;
  status: "C" | "U";
  list_1: number | string;
  list_2: number | string;
}

const emailOf = (r: TestRow): string => r.email;

describe("segmentRows", () => {
  const rows: TestRow[] = [
    { email: "libraire@exemple.fr", status: "C", list_1: 1, list_2: 0 },
    { email: "lecteur@exemple.fr", status: "C", list_1: 0, list_2: 1 },
    { email: "les-deux@exemple.fr", status: "C", list_1: 1, list_2: 1 },
    { email: "desinscrit@exemple.fr", status: "U", list_1: 0, list_2: 0 },
  ];

  it("segmente confirmés/désinscrits/libraires/lecteurs/recouvrement", () => {
    const segments = segmentRows(rows);
    expect(segments.confirmed.map(emailOf)).toEqual([
      "libraire@exemple.fr",
      "lecteur@exemple.fr",
      "les-deux@exemple.fr",
    ]);
    expect(segments.unsubscribed.map(emailOf)).toEqual(["desinscrit@exemple.fr"]);
    expect(segments.libraires.map(emailOf)).toEqual([
      "libraire@exemple.fr",
      "les-deux@exemple.fr",
    ]);
    expect(segments.lecteurs.map(emailOf)).toEqual([
      "lecteur@exemple.fr",
      "les-deux@exemple.fr",
    ]);
    expect(segments.overlap.map(emailOf)).toEqual(["les-deux@exemple.fr"]);
  });

  it("gère `list_1`/`list_2` en chaîne (colonne MySQL TINYINT parfois lue en string)", () => {
    const segments = segmentRows([{ email: "a@exemple.fr", status: "C", list_1: "1", list_2: "0" }]);
    expect(segments.libraires).toHaveLength(1);
    expect(segments.lecteurs).toHaveLength(0);
  });
});

describe("toCsv", () => {
  it("écrit l'en-tête Brevo puis une ligne par contact, SOURCE fixe", () => {
    const csv = toCsv([
      { email: "test@exemple.fr", name: "Jean", surname: "Dupont", created: "2020-10-20", ip: "1.2.3.4" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1]).toBe(`test@exemple.fr;Jean;Dupont;2020-10-20;1.2.3.4;${SOURCE_ATTRIBUTE}`);
  });

  it("liste vide → seulement l'en-tête", () => {
    expect(toCsv([]).trim()).toBe(CSV_HEADER);
  });

  it("champs manquants (name/surname/ip) → colonnes vides, pas 'undefined'", () => {
    const csv = toCsv([{ email: "test@exemple.fr", created: "2020-10-20" }]);
    expect(csv).toContain("test@exemple.fr;;;2020-10-20;;");
    expect(csv).not.toContain("undefined");
  });
});
