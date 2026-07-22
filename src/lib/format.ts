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

const DAY_FR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: "UTC" });
const MONTH_FR = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const YEAR_FR = new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: "UTC" });

/**
 * Date ISO (`YYYY-MM-DD`) découpée en jour/mois/année pour un affichage en
 * bloc (bandeau date de l'agenda `/rencontres`) — `formatDateFr` rend une
 * seule chaîne, inutilisable pour un bloc à 3 tailles de police distinctes.
 * `timeZone: "UTC"` : `iso` n'a pas d'heure (`dayOnly` côté Payload) — sans
 * ce verrou, un fuseau négatif ferait glisser la date locale d'un jour.
 */
export function splitDateFr(iso?: string | null): { jour: string; mois: string; annee: string } | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return {
    jour: DAY_FR.format(d),
    mois: MONTH_FR.format(d).replace(".", "").toUpperCase(),
    annee: YEAR_FR.format(d),
  };
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

