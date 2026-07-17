/**
 * Cœur pur de `newsletter-export.mjs` (plan §5 étape 3) — normalisation,
 * validation, segmentation et rendu CSV, sans I/O. Extrait pour test direct
 * (`vitest.config.ts` : « scripts/** : cœur pur des scripts de migration…
 * même exigence de test que src/lib ») — les données de consentement
 * exportées ici ne se rejouent qu'une fois, une erreur de segmentation ou
 * d'échappement CSV mérite une couverture directe, pas seulement un run
 * manuel.
 */

/** Constante partagée avec `newsletter-import.mjs` (validation de l'en-tête avant tout appel Brevo). */
export const CSV_HEADER = "EMAIL;PRENOM;NOM;CONSENTEMENT_DATE;CONSENTEMENT_IP;SOURCE";

/** Valeur fixe de l'attribut `SOURCE` — c'est aussi la clé du rollback ciblé (plan §5 « Rollback »). */
export const SOURCE_ATTRIBUTE = "import-wp-2020-10";

/** Comptages attendus (plan §5, vérifiés le jour du cadrage) — une dérive n'est pas bloquante mais doit être visible avant l'import. */
export const EXPECTED_COUNTS = { confirmed: 2848, unsubscribed: 7, list1: 1976, list2: 875, overlap: 3 };

/** Email syntaxiquement valide — vérification légère, suffisante pour filtrer les entrées manifestement cassées avant import Brevo. */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** `created` (DATETIME MySQL, ou `Date`/chaîne) → `YYYY-MM-DD` ; absent/invalide → chaîne vide (jamais une exception). */
export function toDateOnly(created) {
  if (!created) return "";
  const d = created instanceof Date ? created : new Date(created);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Déclencheurs d'interprétation en formule par un tableur (Excel/LibreOffice/
 * Google Sheets) qui ouvrirait ce CSV — `=`/`+`/`-`/`@` en tête de cellule,
 * ou tabulation/retour chariot en tête (le tableur les ignore et retombe sur
 * le caractère suivant). Ces valeurs viennent de champs libres (prénom/nom
 * importés) — jamais garanties inoffensives.
 */
const FORMULA_INJECTION_RE = /^[=+\-@\t\r]/;

/**
 * Échappement CSV — délimiteur `;` (contrat Brevo, cf. `CSV_HEADER`),
 * guillemets doublés si le champ contient `;`/`"`/retour à la ligne. Neutralise
 * d'abord une éventuelle injection de formule (OWASP CSV Injection) en
 * préfixant d'une apostrophe toute valeur commençant par `=`/`+`/`-`/`@`/
 * tabulation/retour chariot — l'apostrophe force un tableur à lire la cellule
 * comme du texte plutôt que comme une formule à évaluer.
 */
export function csvField(value) {
  const s = value == null ? "" : String(value);
  const neutralized = FORMULA_INJECTION_RE.test(s) ? `'${s}` : s;
  return /[";\n]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
}

export function toCsvRow(row) {
  return [
    csvField(row.email),
    csvField(row.name ?? ""),
    csvField(row.surname ?? ""),
    csvField(toDateOnly(row.created)),
    csvField(row.ip ?? ""),
    csvField(SOURCE_ATTRIBUTE),
  ].join(";");
}

export function toCsv(rows) {
  return [CSV_HEADER, ...rows.map(toCsvRow)].join("\n") + "\n";
}

/**
 * Normalise (trim + email en minuscule), sépare les lignes syntaxiquement
 * invalides et les doublons d'email AU SEIN DE LA MÊME REQUÊTE SQL (une
 * même adresse ne devrait apparaître qu'une fois — anomalie si ce n'est pas
 * le cas ; à distinguer d'un email présent dans DEUX fichiers de sortie
 * différents — `list_1=1 ET list_2=1` —, qui est le comportement voulu, pas
 * un doublon).
 */
export function normalizeRows(rawRows) {
  const invalid = [];
  const seen = new Map();
  const duplicates = [];
  const clean = [];

  for (const raw of rawRows) {
    const email = String(raw.email ?? "").trim().toLowerCase();
    const row = { ...raw, email };
    if (!email || !isValidEmail(email)) {
      invalid.push(raw);
      continue;
    }
    if (seen.has(email)) {
      duplicates.push(email);
      continue; // première occurrence conservée, jamais deux fois la même adresse dans un fichier
    }
    seen.set(email, row);
    clean.push(row);
  }

  return { clean, invalid, duplicates };
}

/** Segmente les lignes normalisées en libraires/lecteurs/désinscrits (plan §5 « Données et migration »). */
export function segmentRows(clean) {
  const confirmed = clean.filter((r) => r.status === "C");
  const unsubscribed = clean.filter((r) => r.status === "U");
  const libraires = confirmed.filter((r) => Number(r.list_1) === 1);
  const lecteurs = confirmed.filter((r) => Number(r.list_2) === 1);
  const overlap = confirmed.filter((r) => Number(r.list_1) === 1 && Number(r.list_2) === 1);
  return { confirmed, unsubscribed, libraires, lecteurs, overlap };
}
