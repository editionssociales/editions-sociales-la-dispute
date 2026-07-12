/**
 * Helpers de formatage — purs, réutilisables côté serveur comme client.
 */

export type Accent = "navy" | "bottle" | "ocher" | "brick";

/**
 * Les auteurs sont stockés dans WordPress au format `Nom/Prénom`.
 * On restitue « Prénom Nom ».
 */
export function displayAuthor(raw: string): string {
  const idx = raw.indexOf("/");
  if (idx === -1) return raw.trim();
  const last = raw.slice(0, idx).trim();
  const first = raw.slice(idx + 1).replace(/^[\s/]+/, "").trim();
  return [first, last].filter(Boolean).join(" ").trim() || raw.trim();
}

/**
 * Normalise une date de parution en ISO `YYYY-MM-DD`.
 * Formats rencontrés : `AAAAMMJJ` (base brute) et `JJ/MM/AAAA` (ACF get_field).
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

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatDateFr(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DATE_FR.format(d);
}

const PRICE_FR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

export function formatPrice(value?: number | null): string | null {
  return value == null ? null : PRICE_FR.format(value);
}

const INT_FR = new Intl.NumberFormat("fr-FR");

/** Entier en notation française (séparateur de milliers) — compteurs, jauge. */
export function formatInt(value: number): string {
  return INT_FR.format(value);
}

/** Les médias historiques ont des URLs http ; on force https (SSL actif chez OVH). */
export function httpsify(url?: string | null): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}

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
