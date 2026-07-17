#!/usr/bin/env node
/**
 * Étape 3 du plan (`plan/05-communication.md` §« Étapes »/§« Données et
 * migration ») — extrait les abonnés newsletter confirmés/désinscrits de la
 * base locale MariaDB (dump `editionsk884`, plugin « The Newsletter »,
 * table `mod973_newsletter`) et produit 3 CSV d'import Brevo + un rapport
 * d'anomalies — l'ensemble constitue l'ARCHIVE DE CONSENTEMENT remise au
 * client (principe absolu : rien n'est détruit côté WordPress, cette
 * extraction est une simple LECTURE de la base locale des dumps SQL).
 *
 * Prérequis (ce script REFUSE de tourner sans eux, message explicite) :
 *   - MariaDB locale des dumps SQL démarrée sur `127.0.0.1:3307` (mêmes
 *     bases que `scripts/migrate-catalogue/sql-oracle.ts`,
 *     `CATALOG_ORACLE_*` — réutilise la dépendance `mysql2`, déjà présente
 *     en devDependency) ;
 *   - dump `editionsk884.20260701.sql.gz` chargé (LEGACY-STACK.md, README
 *     « dev local (MariaDB 3307) »).
 *
 * Requête exacte (plan §5, section « Données et migration ») :
 *   SELECT email, name, surname, status, created, ip, token, wp_user_id,
 *          list_1, list_2
 *   FROM mod973_newsletter WHERE status IN ('C','U');
 *
 * Segmentation (contrainte `listIds` de l'API d'import Brevo — un fichier =
 * une liste cible, cf. étape 4, `newsletter-import.mjs`) :
 *   - `libraires.csv`  : status='C' AND list_1=1  (attendu : 1 976)
 *   - `lecteurs.csv`   : status='C' AND list_2=1  (attendu : 875)
 *   - `desinscrits.csv`: status='U'               (attendu : 7)
 *   Les emails membres des deux listes (list_1=1 ET list_2=1, attendu : 3)
 *   figurent dans LES DEUX fichiers — c'est le comportement voulu (ils
 *   fusionnent par email côté Brevo à l'import et se retrouvent membres des
 *   deux listes), pas un doublon à corriger. Détail des colonnes CSV,
 *   normalisation et segmentation : `newsletter-export-core.mjs` (pur,
 *   testé — `newsletter-export-core.test.ts`).
 *
 * Usage :
 *   node scripts/newsletter-export.mjs [--out-dir <chemin>] [--help]
 *
 * Sortie par défaut : `../_exports/newsletter-<AAAAMMJJ du jour>/` (SIBLING
 * du dépôt, jamais dans le repo — aucune donnée personnelle en git). Le
 * chemin donné en exemple par le plan (`/Users/yourihamon/marina_es/_exports/
 * newsletter-20260722/`) est reproduit par ce défaut quel que soit
 * l'utilisateur, tant que ce script est lancé depuis la racine du dépôt
 * `site/` (cwd), via `--out-dir` sinon.
 *
 * Ce script s'exécute HORS CI (accès réseau local requis, poste de
 * l'exécutant uniquement) — un échec de connexion est attendu hors de cet
 * environnement, pas une régression à corriger ici.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { EXPECTED_COUNTS, normalizeRows, segmentRows, toCsv } from "./newsletter-export-core.mjs";

const { values } = parseArgs({
  options: {
    "out-dir": { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(
    "Usage: node scripts/newsletter-export.mjs [--out-dir <chemin>] [--help]\n\n" +
      "Extrait mod973_newsletter (MariaDB locale, 127.0.0.1:3307) vers 3 CSV\n" +
      "d'import Brevo (libraires.csv, lecteurs.csv, desinscrits.csv) + rapport.txt.\n" +
      "Défaut --out-dir : ../_exports/newsletter-<AAAAMMJJ>/ (hors du dépôt).",
  );
  process.exit(0);
}

const DB_HOST = process.env.CATALOG_ORACLE_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.CATALOG_ORACLE_PORT || "3307");
const DB_USER = process.env.CATALOG_ORACLE_USER || "root";
const DB_PASSWORD = process.env.CATALOG_ORACLE_PASSWORD || "";
/** Même base que la Boutique dans `sql-oracle.ts` — le plugin newsletter vit dans cette instance. */
const DB_NAME = process.env.CATALOG_ORACLE_BOUTIQUE_DB || "editionsk884";
const TABLE = "mod973_newsletter";

const SQL_QUERY = `SELECT email, name, surname, status, created, ip, token, wp_user_id, list_1, list_2\nFROM ${TABLE} WHERE status IN ('C','U');`;

function todayCompact() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

const OUT_DIR =
  values["out-dir"] || path.resolve(process.cwd(), "..", "_exports", `newsletter-${todayCompact()}`);

async function connect() {
  let mysql;
  try {
    mysql = await import("mysql2/promise");
  } catch (err) {
    throw new Error(
      `[newsletter-export] dépendance "mysql2" introuvable : ${err.message}\n` +
        `→ "mysql2" est une devDependency (pnpm install requis).`,
    );
  }
  try {
    return await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
    });
  } catch (err) {
    throw new Error(
      `[newsletter-export] MariaDB locale injoignable (${DB_HOST}:${DB_PORT}, base "${DB_NAME}") : ` +
        `${err instanceof Error ? err.message : err}\n` +
        `→ Ce script suppose la MariaDB locale des dumps SQL démarrée sur le port 3307, dump ` +
        `"${DB_NAME}" chargé (LEGACY-STACK.md, README « dev local (MariaDB 3307) »). Hors de cet ` +
        `environnement (CI, poste sans les dumps), l'échec est attendu — pas une régression.`,
    );
  }
}

async function main() {
  console.error(`[newsletter-export] connexion à ${DB_HOST}:${DB_PORT}/${DB_NAME}…`);
  const conn = await connect();
  let rawRows;
  try {
    const [rows] = await conn.query(
      `SELECT email, name, surname, status, created, ip, token, wp_user_id, list_1, list_2 FROM ${TABLE} WHERE status IN ('C','U')`,
    );
    rawRows = rows;
  } finally {
    await conn.end();
  }

  const { clean, invalid, duplicates } = normalizeRows(rawRows);
  const { confirmed, unsubscribed, libraires, lecteurs, overlap } = segmentRows(clean);

  await mkdir(OUT_DIR, { recursive: true });

  await writeFile(path.join(OUT_DIR, "libraires.csv"), toCsv(libraires), "utf8");
  await writeFile(path.join(OUT_DIR, "lecteurs.csv"), toCsv(lecteurs), "utf8");
  await writeFile(path.join(OUT_DIR, "desinscrits.csv"), toCsv(unsubscribed), "utf8");

  const fingerprint = createHash("sha256")
    .update(clean.map((r) => `${r.email}|${r.status}|${r.list_1}|${r.list_2}`).sort().join("\n"))
    .digest("hex");

  const countLine = (label, actual, expected) =>
    `  - ${label} : ${actual}` +
    (expected !== undefined ? ` (attendu ${expected}${actual === expected ? ", OK" : ", ÉCART ⚠"})` : "");

  const report = [
    `Export newsletter — ${new Date().toISOString()}`,
    `Source : ${DB_HOST}:${DB_PORT}/${DB_NAME}.${TABLE}`,
    "",
    "Requête SQL :",
    SQL_QUERY,
    "",
    "Comptages :",
    countLine("confirmés (status=C)", confirmed.length, EXPECTED_COUNTS.confirmed),
    countLine("désinscrits (status=U)", unsubscribed.length, EXPECTED_COUNTS.unsubscribed),
    countLine("libraires (list_1)", libraires.length, EXPECTED_COUNTS.list1),
    countLine("lecteurs (list_2)", lecteurs.length, EXPECTED_COUNTS.list2),
    countLine("recouvrement (list_1 ET list_2)", overlap.length, EXPECTED_COUNTS.overlap),
    "",
    `Emails syntaxiquement invalides (exclus des CSV) : ${invalid.length}`,
    ...invalid.map((r) => `  - ${JSON.stringify(r.email ?? "")} (wp_user_id=${r.wp_user_id ?? "?"})`),
    "",
    `Doublons d'email au sein de la requête SQL (première occurrence conservée) : ${duplicates.length}`,
    ...duplicates.map((email) => `  - ${email}`),
    "",
    `Empreinte SHA-256 du jeu de données exporté (email|status|list_1|list_2, trié) : ${fingerprint}`,
    "",
    "Rappel principe absolu : cet export est une LECTURE SEULE de la base locale des dumps SQL — la",
    "table WordPress source n'est jamais modifiée ni supprimée.",
  ].join("\n");

  await writeFile(path.join(OUT_DIR, "rapport.txt"), report + "\n", "utf8");

  console.error(
    `[newsletter-export] ${clean.length} ligne(s) valide(s) (${invalid.length} invalide(s), ` +
      `${duplicates.length} doublon(s)) → ${OUT_DIR}`,
  );
  console.error(
    `[newsletter-export] libraires=${libraires.length} lecteurs=${lecteurs.length} ` +
      `desinscrits=${unsubscribed.length} recouvrement=${overlap.length}`,
  );
  if (
    confirmed.length !== EXPECTED_COUNTS.confirmed ||
    unsubscribed.length !== EXPECTED_COUNTS.unsubscribed ||
    libraires.length !== EXPECTED_COUNTS.list1 ||
    lecteurs.length !== EXPECTED_COUNTS.list2 ||
    overlap.length !== EXPECTED_COUNTS.overlap
  ) {
    console.error(
      "[newsletter-export] ⚠ un ou plusieurs comptages s'écartent des valeurs attendues (plan §5) — " +
        "voir rapport.txt avant de poursuivre vers l'import.",
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
