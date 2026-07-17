#!/usr/bin/env node
/**
 * Étape 4 du plan (`plan/05-communication.md`) — importe les 3 CSV produits
 * par `scripts/newsletter-export.mjs` dans Brevo via 3 appels
 * `POST /v3/contacts/import` (doc vérifiée : https://developers.brevo.com/reference/import-contacts.md
 * — `fileBody` CSV ≤ 10 Mo, réponse 202 + `processId` ; `listIds` s'applique
 * à TOUS les contacts de l'appel, « Mandatory if newList is not defined » y
 * compris pour un import blacklisté — d'où 3 appels distincts, un fichier =
 * une liste, jamais un import mono-appel qui mélangerait les listes).
 *
 * PRÉREQUIS (ce script REFUSE de tourner sans eux, message explicite) :
 *   - `BREVO_API_KEY` posée dans l'environnement (compte Brevo tranché,
 *     étape 1 du plan) ;
 *   - les 3 identifiants numériques de liste Brevo (dashboard → Contacts →
 *     Listes, étape 2 du plan : « Libraires (import WP 2020) », « Lecteurs —
 *     infos trimestrielles (import WP 2020) », « Désinscrits (import WP
 *     2020) ») — PAS de valeur par défaut, une erreur d'ID enverrait 2 848
 *     contacts dans la mauvaise liste ;
 *   - `--in-dir` pointant vers le dossier produit par `newsletter-export.mjs`
 *     (contenant `libraires.csv`/`lecteurs.csv`/`desinscrits.csv`) — pas de
 *     défaut non plus, pour ne jamais importer un export périmé par accident.
 *
 * Chaque appel est ASYNCHRONE côté Brevo : ce script suit le `processId`
 * renvoyé (`GET /v3/processes/{id}`) jusqu'à un statut terminal
 * (`completed`/`failed`) avant de passer à l'appel suivant — les 3 imports
 * sont donc séquentiels, jamais concurrents (plus simple à diagnostiquer en
 * cas d'échec partiel, et évite de multiplier les processus Brevo en
 * parallèle sur le même compte).
 *
 * Usage :
 *   node scripts/newsletter-import.mjs \
 *     --in-dir /Users/…/marina_es/_exports/newsletter-20260722 \
 *     --libraires-list-id 12 --lecteurs-list-id 13 --desinscrits-list-id 14 \
 *     [--dry-run] [--help]
 *
 * `--dry-run` : lit et valide les 3 CSV (en-têtes, comptage de lignes) SANS
 * appeler Brevo — sanity-check avant le run réel, recommandé.
 *
 * Ce script s'exécute HORS CI (secret réel requis) — jamais rejoué
 * automatiquement, c'est un geste opérationnel ponctuel (plan §5 étape 4).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { EXPECTED_CSV_HEADER, countCsvRows, hasExpectedHeader, parseCsvHeader } from "./newsletter-import-core.mjs";

const { values } = parseArgs({
  options: {
    "in-dir": { type: "string" },
    "libraires-list-id": { type: "string" },
    "lecteurs-list-id": { type: "string" },
    "desinscrits-list-id": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(
    "Usage: node scripts/newsletter-import.mjs --in-dir <chemin> " +
      "--libraires-list-id <id> --lecteurs-list-id <id> --desinscrits-list-id <id> [--dry-run] [--help]\n\n" +
      "Importe libraires.csv/lecteurs.csv/desinscrits.csv (produits par newsletter-export.mjs)\n" +
      "dans Brevo via 3 appels POST /v3/contacts/import séquentiels, suivis jusqu'à complétion.\n" +
      "BREVO_API_KEY doit être posée dans l'environnement. --dry-run valide les CSV sans appeler Brevo.",
  );
  process.exit(0);
}

const API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_BASE = "https://api.brevo.com/v3";

const IMPORTS = [
  {
    file: "libraires.csv",
    label: "Libraires",
    listIdFlag: "libraires-list-id",
    emailBlacklist: false,
  },
  {
    file: "lecteurs.csv",
    label: "Lecteurs",
    listIdFlag: "lecteurs-list-id",
    emailBlacklist: false,
  },
  {
    file: "desinscrits.csv",
    label: "Désinscrits",
    listIdFlag: "desinscrits-list-id",
    emailBlacklist: true,
  },
];

function requirePrereqs() {
  const missing = [];
  if (!values["in-dir"]) missing.push("--in-dir");
  for (const imp of IMPORTS) {
    if (!values[imp.listIdFlag]) missing.push(`--${imp.listIdFlag}`);
  }
  if (!values["dry-run"] && !API_KEY) missing.push("BREVO_API_KEY (variable d'environnement)");
  if (missing.length > 0) {
    throw new Error(
      `[newsletter-import] prérequis manquant(s) : ${missing.join(", ")}\n` +
        "→ Aucune valeur par défaut n'est fournie pour ces paramètres (risque : importer dans la\n" +
        "  mauvaise liste, ou un export périmé) — voir --help.",
    );
  }
}

async function readCsv(dir, file) {
  const filePath = path.join(dir, file);
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `[newsletter-import] fichier introuvable : ${filePath}\n` +
        `→ Ce script attend la sortie de newsletter-export.mjs (--in-dir doit pointer dessus). ` +
        `${err instanceof Error ? err.message : err}`,
    );
  }
  if (!hasExpectedHeader(content)) {
    throw new Error(
      `[newsletter-import] en-tête inattendu dans ${filePath} :\n  reçu    : ${parseCsvHeader(content)}\n` +
        `  attendu : ${EXPECTED_CSV_HEADER}\n` +
        "→ Le fichier ne vient probablement pas de newsletter-export.mjs (ou une version différente).",
    );
  }
  return { content, rowCount: countCsvRows(content) };
}

async function brevoRequest(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${BREVO_API_BASE}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "api-key": API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // réponse non-JSON — laissée à null, `text` reste disponible pour le message d'erreur.
  }
  if (!res.ok) {
    throw new Error(
      `[newsletter-import] ${method} ${pathname} → HTTP ${res.status} : ${text.slice(0, 500)}`,
    );
  }
  return json;
}

/** Lance un import et attend un statut terminal (`completed`/`failed`) — backoff simple, plafonné. */
async function runImportAndWait({ file, label, listId, emailBlacklist, content, rowCount }) {
  console.error(`[newsletter-import] → ${label} (${file}, ${rowCount} ligne(s)) — listId=${listId}…`);

  const importResponse = await brevoRequest("/contacts/import", {
    method: "POST",
    body: {
      fileBody: content,
      listIds: [listId],
      emailBlacklist,
      updateExistingContacts: true,
    },
  });

  const processId = importResponse?.processId;
  if (!processId) {
    throw new Error(
      `[newsletter-import] ${label} : réponse Brevo sans processId — ${JSON.stringify(importResponse)}`,
    );
  }
  console.error(`[newsletter-import]   processId=${processId}, suivi jusqu'à complétion…`);

  const MAX_ATTEMPTS = 60; // ~10 min à 10s d'intervalle — largement au-dessus des volumes ici (≤ 2 000 lignes)
  const INTERVAL_MS = 10_000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const process_ = await brevoRequest(`/processes/${processId}`);
    const status = process_?.status;
    if (status === "completed") {
      console.error(`[newsletter-import]   ${label} : import terminé (processId=${processId}).`);
      return { label, processId, status };
    }
    if (status === "failed") {
      throw new Error(
        `[newsletter-import] ${label} : import Brevo en échec (processId=${processId}) — ${JSON.stringify(process_)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
  throw new Error(
    `[newsletter-import] ${label} : délai d'attente dépassé (processId=${processId} toujours non terminal après ` +
      `${(MAX_ATTEMPTS * INTERVAL_MS) / 1000}s) — vérifier manuellement sur le dashboard Brevo.`,
  );
}

async function main() {
  requirePrereqs();
  const dir = values["in-dir"];

  const loaded = [];
  for (const imp of IMPORTS) {
    const { content, rowCount } = await readCsv(dir, imp.file);
    loaded.push({ ...imp, content, rowCount });
    console.error(`[newsletter-import] ${imp.file} : ${rowCount} ligne(s) lue(s) et validée(s).`);
  }

  if (values["dry-run"]) {
    console.error("[newsletter-import] --dry-run : aucun appel Brevo effectué.");
    return;
  }

  const results = [];
  for (const imp of loaded) {
    const listId = Number(values[imp.listIdFlag]);
    const result = await runImportAndWait({
      file: imp.file,
      label: imp.label,
      listId,
      emailBlacklist: imp.emailBlacklist,
      content: imp.content,
      rowCount: imp.rowCount,
    });
    results.push(result);
  }

  console.error(
    `[newsletter-import] terminé : ${results.map((r) => `${r.label}=${r.status}`).join(", ")}.\n` +
      "→ Vérification recommandée (plan §5, critère de recette 1) : dashboard Brevo — comptages par " +
      "liste, échantillon de 10 contacts (attributs, accents UTF-8), données préexistantes du compte intactes.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
