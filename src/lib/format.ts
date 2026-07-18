/**
 * Helpers de formatage — purs, réutilisables côté serveur comme client.
 */

export type Accent = "navy" | "bottle" | "ocher" | "brick";

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

