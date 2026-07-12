import { decodeEntities, displayAuthor, httpsify, parseWpDate } from "./format";
import { rebaseWpMediaUrl } from "./cms-html";
import type { RawBook } from "./catalogue-source";
import type { Term } from "./types";

/**
 * Mapper **pur** WordPress → forme brute neutre du port (`RawBook`),
 * symétrique de `catalogue-pg-map.ts` : tout le dialecte du fil REST WP —
 * entités HTML dans les titres, auteurs `Nom/Prénom`, nombres ACF en chaînes
 * sales, dates `JJ/MM/AAAA`, URLs http, couverture string de l'ancien
 * mu-plugin, rebase cms-* — est absorbé ICI, derrière l'adaptateur.
 * `catalogue-core.ts` ne voit plus jamais WordPress ; le chemin pg — celui qui
 * survivra au swap — n'a plus à fabriquer de fausse enveloppe WP.
 *
 * Sans `server-only` : `catalogue-http.ts` (prod) et les outils Node
 * (`scripts/compare-sources.ts`) partagent le même mapper.
 */

/* -------- Formes brutes WordPress REST (CPT `catalogue` + ACF réexposés) -------- */

export interface WpCoverField {
  url: string;
  width: number;
  height: number;
}
export interface WpBookField {
  isbn?: string | null;
  prix?: string | number | null;
  pages?: string | number | null;
  date_parution?: string | null;
  plus_loin?: string | null;
  table?: string | null;
  extrait?: string | null;
  boutique?: string | null;
  parislibrairies?: string | null;
  lalibrairie?: string | null;
  authors?: Term[];
  collection?: Term | null;
  /** Ancienne forme (string) tolérée pendant le déploiement du mu-plugin. */
  cover?: WpCoverField | string | null;
}
export interface WpBook {
  id: number;
  slug: string;
  title: { rendered: string };
  content?: { rendered: string };
  book?: WpBookField;
}

/* -------- dialecte WP → neutre -------- */

/** Nombres ACF en chaînes sales (`"12,50 €"`, `" 320 p."`) → number, sinon null. */
function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Ratio par défaut quand les dimensions réelles sont inconnues (rendu jamais recadré). */
const DEFAULT_COVER_RATIO = { width: 2, height: 3 };

function toCover(value?: WpCoverField | string | null): RawBook["cover"] {
  if (!value) return null;
  if (typeof value === "string") {
    // Ancienne forme du mu-plugin (avant redéploiement) : URL brute sans dimensions.
    const url = httpsify(value);
    // Découplage CMS (E3) : rebase vers cms-es/cms-ld avant le flip DNS.
    return url ? { url: rebaseWpMediaUrl(url), ...DEFAULT_COVER_RATIO } : null;
  }
  const url = httpsify(value.url);
  if (!url || !value.width || !value.height) return null;
  return { url: rebaseWpMediaUrl(url), width: value.width, height: value.height };
}

/** Fiche REST WordPress → forme brute neutre du port. */
export function wpBookToRawBook(item: WpBook): RawBook {
  const b = item.book ?? {};
  return {
    id: item.id,
    slug: item.slug,
    title: decodeEntities(item.title?.rendered ?? ""),
    // Les auteurs sont stockés dans WordPress au format `Nom/Prénom`.
    authors: (b.authors ?? []).map((a) => ({ name: displayAuthor(a.name), slug: a.slug })),
    collection: b.collection ? { name: b.collection.name, slug: b.collection.slug } : null,
    isbn: b.isbn || null,
    price: toNumber(b.prix),
    pages: toNumber(b.pages),
    publishedAt: parseWpDate(b.date_parution ?? null),
    cover: toCover(b.cover),
    buy: {
      boutique: b.boutique || null,
      parislibrairies: b.parislibrairies || null,
      lalibrairie: b.lalibrairie || null,
    },
    presentationHtml: item.content?.rendered ?? null,
    furtherReadingHtml: b.plus_loin || null,
    tocUrl: httpsify(b.table ?? null),
    excerptUrl: httpsify(b.extrait ?? null),
    // WordPress ne connaît ni `sellable` ni `stock` (données du commerce
    // natif, Payload uniquement) — explicite plutôt qu'absent, pour ne pas
    // laisser croire à un oubli de mapping.
    commerce: null,
  };
}
