/**
 * Cœur pur de `newsletter-import.mjs` (plan §5 étape 4) — validation du
 * contrat CSV produit par `newsletter-export.mjs` avant tout appel réseau.
 * Réutilise `CSV_HEADER` de `newsletter-export-core.mjs` : les deux scripts
 * forment une paire export/import, ce couplage est le contrat lui-même.
 */
import { CSV_HEADER } from "./newsletter-export-core.mjs";

export { CSV_HEADER as EXPECTED_CSV_HEADER };

/** Première ligne d'un contenu CSV, sans retour à la ligne final. */
export function parseCsvHeader(content) {
  return content.split("\n")[0]?.trim() ?? "";
}

/** Nombre de lignes de données (hors en-tête, hors lignes vides finales). */
export function countCsvRows(content) {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

/** `true` ssi l'en-tête correspond exactement au contrat `newsletter-export.mjs`. */
export function hasExpectedHeader(content) {
  return parseCsvHeader(content) === CSV_HEADER;
}
