/**
 * Helpers partagés du script de migration catalogue — purs ou à I/O minimale.
 *
 * Recopiés localement plutôt qu'importés depuis `@/lib/format` : le script est
 * lancé par `payload run` (chargeur `tsx` interne à Payload), et on ne veut pas
 * parier sur la résolution de l'alias `@/*` dans ce contexte d'exécution hors
 * Next — la duplication de ~20 lignes est moins risquée qu'un échec silencieux
 * de résolution de module en migration réelle.
 */

/** Les deux fonds WordPress source. */
export type Site = "es" | "ld";
export const SITES: Site[] = ["es", "ld"];

/** Valeur du champ `edition` (et de `wpSource.site`) côté Payload pour chaque fonds. */
export const EDITION_BY_SITE = {
  es: "editions-sociales",
  ld: "la-dispute",
} as const;
export type EditionSlug = (typeof EDITION_BY_SITE)[Site];

export const SITE_LABEL: Record<Site, string> = {
  es: "Éditions sociales",
  ld: "La Dispute",
};

/* ─────────────────────────── Clés de maps ─────────────────────────── */

/**
 * Deux espaces de clés se ressemblent à s'y méprendre dans la migration :
 * côté source on indexe par code site (`es:123` — patches SQL, médias) ; côté
 * Payload par slug d'édition (`editions-sociales:123` — dédup import,
 * balayage). Les confondre échouerait en silence (lookup toujours vide) — ces
 * constructeurs typés font échouer la confusion au typecheck.
 */

/** Clé côté source WP : code site + id WP (patches `plus_loin`, résolutions médias). */
export function siteKey(site: Site, wpId: number): string {
  return `${site}:${wpId}`;
}

/** Clé côté Payload : slug d'édition + id WP (`wpSource`, capture/balayage). */
export function wpSourceKey(edition: EditionSlug, wpId: number): string {
  return `${edition}:${wpId}`;
}

/** Clé d'une collection Payload : slug d'édition + slug de collection. */
export function collectionKey(edition: EditionSlug, slug: string): string {
  return `${edition}:${slug}`;
}

/* ─────────────────────────── Dates ─────────────────────────── */

/**
 * Normalise une date de parution en ISO `YYYY-MM-DD`.
 * Contexte vérifié en prod (09/07) : `date_parution` est `JJ/MM/AAAA` sur les
 * 295 fiches — on tolère aussi `AAAAMMJJ` (ancien format ACF brut) et l'ISO.
 */
export function parseWpDate(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v); // AAAAMMJJ
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v); // JJ/MM/AAAA
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/* ─────────────────────────── Texte ─────────────────────────── */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  ndash: "\u2013",
  mdash: "\u2014",
};

/** Décode les entités HTML renvoyées par l'API REST WordPress (titres, etc.). */
export function decodeEntities(input: string): string {
  return input.replace(/&(#?[\w]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/** ISBN pollué d'espaces/tabs (surtout côté LD, espace final) : trim complet. */
export function trimIsbn(value?: string | null): string | null {
  if (value == null) return null;
  const v = value.trim();
  return v === "" ? null : v;
}

/* ─────────────────────────── Nombres ─────────────────────────── */

/** `book.prix` est une string à point décimal (`'14.5'`) ; parfois déjà un number. */
export function parsePrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  // Virgule décimale française tolérée ("14,50") — parseFloat s'arrêterait à la
  // virgule et perdrait silencieusement les centimes.
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * `book.pages` est string|null, avec une valeur sale connue (`'354.104'`).
 * `parseInt` s'arrête au premier caractère non numérique après les chiffres
 * initiaux → `parseInt('354.104', 10) === 354`, exactement le comportement
 * voulu (pas un `parseFloat` suivi d'un arrondi, qui donnerait le même
 * résultat ici mais masquerait moins bien l'intention : tronquer, pas arrondir).
 */
export function parsePages(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? Math.trunc(value) : parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/* ─────────────────────────── Réseau ─────────────────────────── */

export class HttpError extends Error {
  constructor(
    public url: string,
    public status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} sur ${url}`);
    this.name = "HttpError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `fetch` avec timeout et retry (x3, backoff linéaire 500ms/1s/1.5s). Ne
 * retente pas les 4xx (erreur définitive côté client) mais retente réseau,
 * timeout et 5xx.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.status >= 400 && res.status < 500) {
        // Erreur définitive : inutile de retenter.
        return res;
      }
      if (!res.ok) {
        throw new HttpError(url, res.status);
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(attempt * 500);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Échec réseau sur ${url}`);
}

/* ─────────────────────────── Logger ─────────────────────────── */

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  at: string;
}

/**
 * Logger minimal : écrit sur la console (préfixe horodaté) et conserve
 * l'historique en mémoire pour que `report.ts` puisse l'inclure verbatim.
 */
export function createLogger() {
  const entries: LogEntry[] = [];
  function push(level: LogLevel, message: string) {
    const entry: LogEntry = { level, message, at: new Date().toISOString() };
    entries.push(entry);
    const line = `[${entry.at}] ${level.toUpperCase()} ${message}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
  return {
    info: (msg: string) => push("info", msg),
    warn: (msg: string) => push("warn", msg),
    error: (msg: string) => push("error", msg),
    entries,
  };
}
export type Logger = ReturnType<typeof createLogger>;

/* ─────────────────────────── CLI ─────────────────────────── */

export interface CliArgs {
  site: "all" | Site;
  dryRun: boolean;
}

/** Parseur d'arguments minimal (pas de dépendance nouvelle — pas de `minimist`). */
export function parseCliArgs(argv: string[]): CliArgs {
  let site: CliArgs["site"] = "all";
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--site=")) {
      const v = arg.slice("--site=".length);
      if (v === "all" || v === "es" || v === "ld") site = v;
      else throw new Error(`--site invalide: "${v}" (attendu: all|es|ld)`);
    }
  }
  return { site, dryRun };
}

export function sitesFor(cli: CliArgs["site"]): Site[] {
  return cli === "all" ? SITES : [cli];
}

/* ─────────────────────────── Divers ─────────────────────────── */

/** Comparaison profonde légère (objets/tableaux JSON-compatibles) — sert à prouver l'idempotence. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj).sort();
  const bKeys = Object.keys(bObj).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k, i) => k === bKeys[i] && deepEqual(aObj[k], bObj[k]));
}

