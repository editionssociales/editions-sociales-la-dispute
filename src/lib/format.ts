/**
 * Helpers de formatage — purs, réutilisables côté serveur comme client.
 */

// `pop-orange` a rejoint l'union comme couleur d'IDENTITÉ de La Dispute
// (ex-brick, retour client 2026-08-20) — ce n'est pas un accent de couverture :
// il ne figure pas dans `ACCENTS` (`lib/accents.ts`), la liste qu'itèrent les
// dos de livres décoratifs, qui gardent leur brick.
export type Accent = "navy" | "bottle" | "ocher" | "brick" | "pop-orange";

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

const ISO_DAY_PARIS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Jour civil FRANÇAIS (`Europe/Paris`) d'un instant, en `YYYY-MM-DD`. À
 * utiliser pour ramener un timestamp Payload à une date : le picker `dayOnly`
 * stocke minuit LOCAL de l'éditeur·rice (soit 22h/23h UTC la veille depuis la
 * France) — un `slice(0, 10)` sur l'ISO UTC rendrait la veille. Correct dans
 * les deux conventions rencontrées (minuit UTC du seed SQL, minuit Paris de
 * l'admin), tant que la saisie se fait depuis la France.
 */
export function isoDayParis(instant: string | Date): string | null {
  const d = instant instanceof Date ? instant : new Date(instant);
  return Number.isNaN(d.getTime()) ? null : ISO_DAY_PARIS.format(d);
}

// `hourCycle: "h23"` fixé explicitement (pas `hour12: false`, dont le mapping
// vers `h24` selon la locale/l'ICU ferait lire minuit comme "24" plutôt que
// "0" — piège connu de `Intl.DateTimeFormat`).
const HOUR_PARIS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hour: "numeric",
  hourCycle: "h23",
});

/**
 * Instant UTC du minuit Europe/Paris du jour `day` (`YYYY-MM-DD`) — inverse
 * d'`isoDayParis` (jour → instant, plutôt qu'instant → jour). Sert de borne
 * « à venir / passée » (chips admin `rencontres`) : `<jour>T00:00:00Z` serait
 * faux la moitié de l'année — une rencontre saisie le jour même dans l'admin
 * (minuit Paris stocké en UTC, donc 22h/23h UTC la VEILLE, cf. `isoDayParis`)
 * tomberait « passée » dès minuit UTC au lieu de minuit heure française.
 *
 * Sans lib de fuseaux : essaie l'offset été (+02:00) puis hiver (+01:00) et
 * retient celui dont l'instant obtenu retombe bien à 0h à Paris ET dont
 * `isoDayParis` de cet instant redonne `day` (double vérification — un
 * décalage d'offset autour du changement d'heure peut glisser sur un autre
 * jour civil). Repli `day + "T00:00:00Z"` si aucun des deux n'aboutit
 * (théoriquement impossible, l'écart hiver/été ne dépasse jamais 1 h).
 */
export function parisMidnightUtc(day: string): string {
  for (const offset of ["+02:00", "+01:00"]) {
    const d = new Date(`${day}T00:00:00${offset}`);
    if (Number.isNaN(d.getTime())) continue;
    if (Number(HOUR_PARIS.format(d)) === 0 && isoDayParis(d) === day) {
      return d.toISOString();
    }
  }
  return `${day}T00:00:00Z`;
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

/**
 * Joint une liste de noms à la française : virgules entre les éléments, « et »
 * avant le dernier (jamais de virgule d'Oxford) — ex. « A », « A et B »,
 * « A, B et C ». Sert au bureau éditorial des pages maisons (`site-content`,
 * `editions/[slug]/page.tsx`), dont le JSX rendait jusqu'ici une chaîne fixe
 * de ce même gabarit.
 */
export function joinNomsFr(noms: string[]): string {
  if (noms.length === 0) return "";
  if (noms.length === 1) return noms[0];
  return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

