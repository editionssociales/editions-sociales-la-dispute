import { describe, expect, it } from "vitest";
import {
  buildInventoryRow,
  decideDonationAction,
  formatInventoryCsv,
  formatSectionsAChoisir,
  parseChoixCsv,
  summarizeInventory,
  type InventorySessionFacts,
} from "./backfill-dons-core.ts";

/* ─────────────────────────── formatSectionsAChoisir ─────────────────────────── */

describe("formatSectionsAChoisir", () => {
  it("formate la section choix d'un palier à choix (« sectionId:opt1|opt2 »)", () => {
    expect(formatSectionsAChoisir("palier-50")).toBe("titre:antifascisme|ecologie-de-guerre");
  });

  it("rend une chaîne vide pour un palier fixe (aucune section choix)", () => {
    expect(formatSectionsAChoisir("palier-15")).toBe("");
  });
});

/* ─────────────────────────── buildInventoryRow ─────────────────────────── */

function inventoryFacts(overrides: Partial<InventorySessionFacts> = {}): InventorySessionFacts {
  return {
    sessionId: "cs_test_1",
    createdAtISO: "2026-08-20T10:00:00.000Z",
    tierRaw: "palier-15",
    amountEuros: 15,
    email: "don@example.org",
    donLinesPresent: false,
    orderExists: false,
    ...overrides,
  };
}

describe("buildInventoryRow", () => {
  it("classe un palier fixe non traité en « fixe-a-creer »", () => {
    const row = buildInventoryRow(inventoryFacts({ tierRaw: "palier-15" }));
    expect(row.bucket).toBe("fixe-a-creer");
    expect(row.choixRequis).toBe(false);
    expect(row.sectionsAChoisir).toBe("");
  });

  it("classe un palier à choix non traité en « choix-en-attente » avec ses sections", () => {
    const row = buildInventoryRow(inventoryFacts({ tierRaw: "palier-100" }));
    expect(row.bucket).toBe("choix-en-attente");
    expect(row.choixRequis).toBe(true);
    expect(row.sectionsAChoisir).toBe("titre:gaza|fascisme-et-dictature");
  });

  it("classe en « deja-traite » dès qu'une commande existe, quel que soit le palier", () => {
    const row = buildInventoryRow(inventoryFacts({ tierRaw: "palier-100", orderExists: true }));
    expect(row.bucket).toBe("deja-traite");
    expect(row.dejaTraite).toBe(true);
  });

  it("classe un montant libre (tier « libre ») en « hors-perimetre »", () => {
    const row = buildInventoryRow(inventoryFacts({ tierRaw: "libre" }));
    expect(row.bucket).toBe("hors-perimetre");
  });

  it("classe un tier absent/corrompu en « hors-perimetre » (jamais un throw)", () => {
    const row = buildInventoryRow(inventoryFacts({ tierRaw: undefined }));
    expect(row.bucket).toBe("hors-perimetre");
    expect(row.tier).toBe("");
  });
});

describe("summarizeInventory", () => {
  it("agrège les quatre buckets", () => {
    const rows = [
      buildInventoryRow(inventoryFacts({ sessionId: "a", tierRaw: "palier-15" })),
      buildInventoryRow(inventoryFacts({ sessionId: "b", tierRaw: "palier-100" })),
      buildInventoryRow(inventoryFacts({ sessionId: "c", tierRaw: "palier-100", orderExists: true })),
      buildInventoryRow(inventoryFacts({ sessionId: "d", tierRaw: "libre" })),
    ];
    expect(summarizeInventory(rows)).toEqual({
      total: 4,
      fixedToCreate: 1,
      choiceWaiting: 1,
      alreadyTreated: 1,
      outOfScope: 1,
    });
  });
});

describe("formatInventoryCsv", () => {
  it("émet l'en-tête puis une ligne par don, séparateur ';', oui/non pour les booléens", () => {
    const row = buildInventoryRow(inventoryFacts({ sessionId: "cs_test_1", tierRaw: "palier-15", amountEuros: 15 }));
    const csv = formatInventoryCsv([row]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("sessionId;date;tier;montant;email;choixRequis;sectionsAChoisir;dejaTraite");
    expect(lines[1]).toBe("cs_test_1;2026-08-20T10:00:00.000Z;palier-15;15,00;don@example.org;non;;non");
  });

  it("échappe une cellule contenant le séparateur (RFC 4180)", () => {
    const row = buildInventoryRow(inventoryFacts({ tierRaw: "palier-100" }));
    // Cas synthétique : un email contenant ';' (jamais réel, sert à exercer l'échappement).
    const csv = formatInventoryCsv([{ ...row, email: "a;b@example.org" }]);
    expect(csv).toContain('"a;b@example.org"');
  });
});

/* ─────────────────────────── decideDonationAction ─────────────────────────── */

describe("decideDonationAction", () => {
  it("« deja-traite » prime sur tout le reste dès qu'une commande existe", () => {
    expect(
      decideDonationAction({
        sessionId: "cs_1",
        tierRaw: "palier-15",
        donLinesAlreadyPresent: true,
        orderAlreadyExists: true,
      }),
    ).toEqual({ kind: "deja-traite" });
  });

  it("« rejoue-donlines-existantes » si donLines déjà posée mais aucune commande (webhook resté en échec partiel)", () => {
    expect(
      decideDonationAction({
        sessionId: "cs_1",
        tierRaw: "palier-100",
        donLinesAlreadyPresent: true,
        orderAlreadyExists: false,
      }),
    ).toEqual({ kind: "rejoue-donlines-existantes" });
  });

  it("« hors-perimetre » pour un montant libre", () => {
    expect(
      decideDonationAction({
        sessionId: "cs_1",
        tierRaw: "libre",
        donLinesAlreadyPresent: false,
        orderAlreadyExists: false,
      }),
    ).toEqual({ kind: "hors-perimetre", tierRaw: "libre" });
  });

  it("palier fixe → « resolu » avec la composition entière, sans sélection", () => {
    const decision = decideDonationAction({
      sessionId: "cs_1",
      tierRaw: "palier-35",
      donLinesAlreadyPresent: false,
      orderAlreadyExists: false,
    });
    expect(decision.kind).toBe("resolu");
    if (decision.kind === "resolu") {
      expect(decision.tierId).toBe("palier-35");
      expect(decision.items).toEqual([
        { slug: "manifeste-du-parti-communiste", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ]);
    }
  });

  it("palier à choix ABSENT du CSV --choix → « choix-en-attente » (skip doux)", () => {
    expect(
      decideDonationAction({
        sessionId: "cs_1",
        tierRaw: "palier-100",
        donLinesAlreadyPresent: false,
        orderAlreadyExists: false,
      }),
    ).toEqual({ kind: "choix-en-attente", tierId: "palier-100" });
  });

  it("palier à choix PRÉSENT dans le CSV avec sélection valide → « resolu »", () => {
    const decision = decideDonationAction({
      sessionId: "cs_1",
      tierRaw: "palier-100",
      donLinesAlreadyPresent: false,
      orderAlreadyExists: false,
      choixSelection: { titre: "gaza" },
    });
    expect(decision.kind).toBe("resolu");
    if (decision.kind === "resolu") {
      expect(decision.items).toEqual([
        { slug: "gaza-genocide-annonce", qty: 1 },
        { slug: "tote-bag", qty: 1 },
        { slug: "planche-de-stickers", qty: 1 },
      ]);
    }
  });

  it("palier à choix PRÉSENT dans le CSV mais option inconnue → « erreur » (pas un skip doux)", () => {
    expect(
      decideDonationAction({
        sessionId: "cs_1",
        tierRaw: "palier-100",
        donLinesAlreadyPresent: false,
        orderAlreadyExists: false,
        choixSelection: { titre: "inexistant" },
      }),
    ).toEqual({ kind: "erreur", tierId: "palier-100", reason: "option-inconnue:titre" });
  });

  it("palier à choix PRÉSENT dans le CSV mais mauvais sectionId (section attendue absente) → « erreur »", () => {
    expect(
      decideDonationAction({
        sessionId: "cs_1",
        tierRaw: "palier-100",
        donLinesAlreadyPresent: false,
        orderAlreadyExists: false,
        choixSelection: { "mauvaise-section": "gaza" },
      }),
    ).toEqual({ kind: "erreur", tierId: "palier-100", reason: "choix-manquant:titre" });
  });
});

/* ─────────────────────────── parseChoixCsv ─────────────────────────── */

describe("parseChoixCsv", () => {
  it("parse une ligne simple (une section)", () => {
    const { bySession, errors } = parseChoixCsv("cs_test_1;titre:gaza");
    expect(errors).toEqual([]);
    expect(bySession.get("cs_test_1")).toEqual({ titre: "gaza" });
  });

  it("parse une ligne à plusieurs sections (séparées par ',')", () => {
    const { bySession, errors } = parseChoixCsv("cs_test_1;duo:nouveautes,titre:gaza");
    expect(errors).toEqual([]);
    expect(bySession.get("cs_test_1")).toEqual({ duo: "nouveautes", titre: "gaza" });
  });

  it("ignore les lignes vides et les commentaires '#'", () => {
    const { bySession, errors } = parseChoixCsv("\n# commentaire\ncs_test_1;titre:gaza\n\n");
    expect(errors).toEqual([]);
    expect(bySession.size).toBe(1);
  });

  it("signale une ligne sans séparateur ';' sans jeter", () => {
    const { bySession, errors } = parseChoixCsv("cs_test_1 titre:gaza");
    expect(bySession.size).toBe(0);
    expect(errors).toEqual([{ line: 1, raw: "cs_test_1 titre:gaza", reason: "séparateur ';' absent" }]);
  });

  it("signale une paire malformée (pas de ':')", () => {
    const { bySession, errors } = parseChoixCsv("cs_test_1;titre-sans-deux-points");
    expect(bySession.size).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain("malformée");
  });

  it("signale un sessionId en doublon — garde la première occurrence", () => {
    const { bySession, errors } = parseChoixCsv("cs_test_1;titre:gaza\ncs_test_1;titre:fascisme-et-dictature");
    expect(bySession.get("cs_test_1")).toEqual({ titre: "gaza" });
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain("doublon");
  });

  it("continue de parser les lignes suivantes après une ligne malformée", () => {
    const { bySession, errors } = parseChoixCsv("ligne-cassee\ncs_test_2;titre:gaza");
    expect(bySession.get("cs_test_2")).toEqual({ titre: "gaza" });
    expect(errors).toHaveLength(1);
  });
});
