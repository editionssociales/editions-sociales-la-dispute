/**
 * Rapport de migration — Markdown + JSON, écrits dans `out/` (gitignoré).
 * C'est la pièce montrée au client à l'échantillonnage (E3/E8).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthorDivergence, BooksUpsertReport, SweepResult, UpsertAuthorsResult, UpsertCollectionsResult } from "./import.ts";
import type { MediaFailure } from "./media.ts";
import type { OracleReport } from "./sql-oracle.ts";
import { SITE_LABEL, type Site } from "./utils.ts";

/** Attendus R2 §1.3 (dumps du 01/07) — comparés aux mesures SQL/REST du run, jamais utilisés pour bloquer. */
export const EXPECTED = {
  publishedCounts: { es: 117, ld: 178 } as Record<Site, number>,
  fillRates: {
    plus_loin: { es: 47, ld: 58 },
    table: { es: 53, ld: 62 },
    extrait: { es: 2, ld: 1 },
    boutique: { es: 95, ld: 118 },
    parislibrairies: { es: 107, ld: 164 },
    lalibrairie: { es: 108, ld: 163 },
  } as Record<string, Record<Site, number>>,
  brokenBoutiqueLinks: 9,
};

export interface ReportInput {
  startedAt: number;
  sites: Site[];
  dryRun: boolean;
  captured: Record<Site, number>;
  oracle: OracleReport;
  authors: UpsertAuthorsResult;
  collections: UpsertCollectionsResult;
  books: BooksUpsertReport;
  sweep: SweepResult;
  mediaFailures: MediaFailure[];
}

function fmtDivergence(d: AuthorDivergence): string {
  return `- \`${d.slug}\` (${SITE_LABEL[d.site]}) : "${d.existingName}" vs "${d.incomingName}"${d.resolvedToLd ? " → LD retenu" : " → ES ignoré (LD pas encore vu)"}`;
}

function fillRateLines(oracle: OracleReport, sites: Site[]): string[] {
  const columns = 1 + sites.length + 1; // Champ + un par site + Attendu
  const header = `| Champ | ${sites.map((s) => `${SITE_LABEL[s]} (mesuré)`).join(" | ")} | Attendu |`;
  const separator = `|${Array(columns).fill("---").join("|")}|`;
  const rows: string[] = [header, separator];
  const fields: { key: string; expectedKey: keyof typeof EXPECTED.fillRates; sqlKey: string }[] = [
    { key: "plus_loin", expectedKey: "plus_loin", sqlKey: "plus_loin_coalesced" },
    { key: "table", expectedKey: "table", sqlKey: "table" },
    { key: "extrait", expectedKey: "extrait", sqlKey: "extrait_choisi" },
    { key: "boutique", expectedKey: "boutique", sqlKey: "boutique_es" },
    { key: "parislibrairies", expectedKey: "parislibrairies", sqlKey: "parislibrairies" },
    { key: "lalibrairie", expectedKey: "lalibrairie", sqlKey: "lalibrairie" },
  ];
  for (const f of fields) {
    const measured = sites.map((s) => oracle.fillRates[s]?.[f.sqlKey] ?? oracle.fillRates[s]?.[f.key] ?? "—");
    const expected = sites.map((s) => EXPECTED.fillRates[f.expectedKey]?.[s] ?? "—").join("/");
    rows.push(`| ${f.key} | ${measured.join(" | ")} | ${expected} |`);
  }
  return rows;
}

export function buildMarkdown(input: ReportInput): string {
  const durationS = ((Date.now() - input.startedAt) / 1000).toFixed(1);
  const lines: string[] = [];
  lines.push(`# Rapport de migration catalogue`);
  lines.push("");
  lines.push(
    `Sites traités : ${input.sites.map((s) => SITE_LABEL[s]).join(", ")} · Mode : ${input.dryRun ? "**dry-run** (aucune écriture)" : "écriture réelle"} · Durée : ${durationS}s`,
  );
  lines.push("");

  lines.push(`## Comptages`);
  for (const s of input.sites) {
    lines.push(
      `- **${SITE_LABEL[s]}** : ${input.captured[s]} fiche(s) captées (REST) — ${input.oracle.sqlCounts[s] ?? "?"} en base SQL (attendu ${EXPECTED.publishedCounts[s]}).`,
    );
  }
  if (input.oracle.restOnly.length > 0) {
    lines.push("");
    lines.push(
      `**REST seul** (postérieures au dump du 01/07 — pas des anomalies) : ` +
        input.oracle.restOnly.map((r) => `${r.slug} (${SITE_LABEL[r.site]})`).join(", "),
    );
  }
  lines.push("");

  lines.push(`## Taux de remplissage (mesurés vs attendus R2 §1.3)`);
  lines.push(...fillRateLines(input.oracle, input.sites));
  lines.push("");

  lines.push(`## Patchs \`plus_loin\` (ES — REST null, SQL non vide)`);
  if (input.oracle.plusLoinPatches.length === 0) {
    lines.push("Aucun patch nécessaire.");
  } else {
    for (const p of input.oracle.plusLoinPatches) {
      lines.push(`- \`${p.slug}\` (wpId ${p.wpId}) ← \`${p.from}\``);
    }
  }
  lines.push("");

  lines.push(`## Liens boutique`);
  if (input.oracle.boutiqueLinks == null) {
    lines.push("Base Boutique injoignable — inventaire non vérifié en base ce run (diagnostic, non bloquant).");
  } else {
    const broken = input.oracle.boutiqueLinks.filter((b) => b.broken);
    lines.push(
      `${input.oracle.boutiqueLinks.length} lien(s) inventorié(s), **${broken.length} cassé(s)** (attendu ${EXPECTED.brokenBoutiqueLinks}).`,
    );
    if (broken.length > 0) {
      lines.push("");
      for (const b of broken) {
        lines.push(`- \`${b.slug}\` (${SITE_LABEL[b.site]}) → ${b.url}`);
      }
    }
  }
  lines.push("");

  lines.push(`## Descriptions de termes auteur/collection (preuve de non-perte des bios)`);
  if (input.oracle.termDescriptionLeaks.length === 0) {
    lines.push("Toutes vides — confirmé (0 description non vide sur les termes auteur/collection inspectés).");
  } else {
    lines.push(`⚠️ ${input.oracle.termDescriptionLeaks.length} description(s) non vide(s) trouvée(s) :`);
    for (const l of input.oracle.termDescriptionLeaks) {
      lines.push(`- \`${l.slug}\` (${l.taxonomy}, ${SITE_LABEL[l.site]}) : "${l.description.slice(0, 80)}"`);
    }
  }
  lines.push("");

  lines.push(`## Auteurs`);
  lines.push(
    `${input.authors.created} créé(s), ${input.authors.updated} mis à jour, ${input.authors.unchanged} inchangé(s).`,
  );
  if (input.authors.divergences.length > 0) {
    lines.push("");
    lines.push(`Divergences de graphie à slug égal :`);
    input.authors.divergences.forEach((d) => lines.push(fmtDivergence(d)));
  }
  lines.push("");

  lines.push(`## Collections`);
  lines.push(
    `${input.collections.created} créée(s), ${input.collections.updated} mise(s) à jour, ${input.collections.unchanged} inchangée(s).`,
  );
  lines.push("");

  lines.push(`## Livres`);
  lines.push(
    `${input.books.created} créé(s), ${input.books.updated} mis à jour, ${input.books.unchanged} inchangé(s).`,
  );
  lines.push("");
  lines.push(
    `**\`contentTouched = true\`** (attendu 0) : ${input.books.contentTouchedKeys.length}` +
      (input.books.contentTouchedKeys.length > 0
        ? ` — ${input.books.contentTouchedKeys.map((k) => k.slug).join(", ")}`
        : ""),
  );
  if (input.books.missingAuthorRefs.length > 0) {
    lines.push("");
    lines.push(
      `⚠️ Fiches avec référence(s) auteur non résolue(s) : ` +
        input.books.missingAuthorRefs.map((r) => r.slug).join(", "),
    );
  }
  lines.push("");

  lines.push(`## Suppressions (balayage)`);
  if (input.sweep.drafted.length === 0) {
    lines.push("Aucune fiche disparue de la capture.");
  } else {
    lines.push(`${input.sweep.drafted.length} fiche(s) passée(s) en draft (jamais supprimée) :`);
    input.sweep.drafted.forEach((d) => lines.push(`- \`${d.slug}\` (${SITE_LABEL[d.site]})`));
  }
  lines.push("");

  lines.push(`## Médias en échec`);
  if (input.mediaFailures.length === 0) {
    lines.push("Aucun échec.");
  } else {
    lines.push(`${input.mediaFailures.length} échec(s) (fiche conservée, repli légitime pour les couvertures) :`);
    input.mediaFailures.forEach((f) =>
      lines.push(`- [${f.kind}] ${SITE_LABEL[f.site]} #${f.wpId} — ${f.sourceUrl} (${f.error})`),
    );
  }
  lines.push("");

  return lines.join("\n");
}

export function buildJson(input: ReportInput): unknown {
  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - input.startedAt,
    sites: input.sites,
    dryRun: input.dryRun,
    captured: input.captured,
    expected: EXPECTED,
    oracle: {
      sqlCounts: input.oracle.sqlCounts,
      restOnly: input.oracle.restOnly,
      plusLoinPatches: input.oracle.plusLoinPatches,
      fillRates: input.oracle.fillRates,
      termDescriptionLeaks: input.oracle.termDescriptionLeaks,
      boutiqueLinks: input.oracle.boutiqueLinks,
    },
    authors: input.authors,
    collections: {
      created: input.collections.created,
      updated: input.collections.updated,
      unchanged: input.collections.unchanged,
    },
    books: {
      created: input.books.created,
      updated: input.books.updated,
      unchanged: input.books.unchanged,
      createdList: input.books.createdList,
      updatedList: input.books.updatedList,
      missingAuthorRefs: input.books.missingAuthorRefs,
      contentTouchedKeys: input.books.contentTouchedKeys,
    },
    sweep: input.sweep,
    mediaFailures: input.mediaFailures,
  };
}

export async function writeReport(input: ReportInput, outDir: string): Promise<{ mdPath: string; jsonPath: string }> {
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const mdPath = path.join(outDir, `report-${ts}.md`);
  const jsonPath = path.join(outDir, `report-${ts}.json`);
  await writeFile(mdPath, buildMarkdown(input), "utf8");
  await writeFile(jsonPath, JSON.stringify(buildJson(input), null, 2), "utf8");
  return { mdPath, jsonPath };
}
