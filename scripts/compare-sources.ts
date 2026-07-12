/**
 * Parité http ⟷ pg du catalogue — E5 de `plan/03-catalogue.md`.
 *
 * `pnpm payload run scripts/compare-sources.ts -- [--site=all|es|ld] [--help]`
 *
 * Compare ce que servirait le front s'il lisait WordPress (adaptateur http,
 * source de vérité actuelle) à ce qu'il servirait en lisant Payload/Postgres
 * (adaptateur pg, `CATALOGUE_SOURCE=pg`) : catalogue fusionné (`buildCatalogue`),
 * fiche détaillée (`buildBookDetail`, HTML comparé **après** `sanitizeCms`),
 * facettes (`computeFacets`) et nouveautés (`newReleases`). C'est l'outil
 * rejoué à chaque re-import (E3/E8/E9) — un run propre exige 0 écart bloquant.
 *
 * Lecture seule : ce script ne fait **aucune** écriture Payload (uniquement
 * des `payload.find`) — pas de `context.migration`/`disableRevalidate` à poser
 * ici, contrairement à `scripts/migrate-catalogue/import.ts`.
 *
 * Note de dépendance (même remarque que `migrate-catalogue/index.ts`) :
 * `src/payload.config.ts` et `src/payload-types.ts` doivent déjà exister
 * (scaffold Payload, E1/E2) pour que ce fichier typecheck/exécute — c'est
 * acquis à ce stade du plan (E4 vient d'être livré).
 *
 * On **n'importe pas** `src/lib/catalogue-http.ts` / `catalogue-pg.ts` /
 * `catalogue.ts` / `boutique.ts` : ils posent `import "server-only"`, un
 * marqueur qui *throw* dès qu'il est résolu par un runtime Node nu (`payload
 * run` n'est pas le bundler Next avec la condition d'export `react-server`
 * "server-only" en profite) — vérifié : `node -e "require('server-only')"`
 * plante bien hors Next. On réimplique donc localement les deux mêmes accès
 * (REST WP paginé — via `fetch-wp.ts`, déjà partagé avec la migration — et
 * Local API Payload) et on importe seulement la partie **pure** de la couche
 * data (`catalogue-core.ts`, `catalogue-source.ts`, `catalogue-pg-map.ts`,
 * `types.ts`), qui n'a jamais ce marqueur.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPayload, type Payload } from "payload";
import config from "../src/payload.config.ts";

import {
  buildBookDetail,
  buildCatalogue,
  computeFacets,
  newReleases,
  queryBooks,
} from "../src/lib/catalogue-core.ts";
import { payloadBookToWpBook } from "../src/lib/catalogue-pg-map.ts";
import { slugFromBoutiqueLink, type WcProduct, type WpBook } from "../src/lib/catalogue-source.ts";
import { fetchAllPages } from "../src/lib/fetch-all-pages.ts";
import type { Book, BookDetail, EditionSlug, Facet } from "../src/lib/types.ts";
import type { Book as PayloadBook } from "../src/payload-types.ts";

import { fetchCatalogue, healthCheck } from "./migrate-catalogue/fetch-wp.ts";
import { createLogger, fetchWithRetry, type Logger, type Site } from "./migrate-catalogue/utils.ts";

const OUT_DIR = "scripts/migrate-catalogue/out";

const EDITION_BY_SITE: Record<Site, EditionSlug> = {
  es: "editions-sociales",
  ld: "la-dispute",
};
const SITE_LABEL: Record<Site, string> = { es: "Éditions sociales", ld: "La Dispute" };

/** Hôtes WordPress connus des deux fonds (couvertures/PDF/HTML éditorial) — hors boutique. */
const OVH_MEDIA_HOSTS = ["editionssociales.fr", "www.editionssociales.fr", "ladispute.fr", "www.ladispute.fr"];

/**
 * `boutique.editionssociales.fr` reste un hôte WooCommerce légitime pour les
 * liens/images d'achat (angle mort n°2 du plan — hors périmètre de la
 * migration média) : volontairement absent de `OVH_MEDIA_HOSTS`, sans quoi le
 * contrôle « 0 URL OVH résiduelle » lèverait un faux bloquant permanent sur
 * chaque fiche vendue en boutique.
 */

/* ─────────────────────────── CLI ─────────────────────────── */

const HELP = `Usage : pnpm payload run scripts/compare-sources.ts -- [options]

Compare le catalogue servi par l'adaptateur http (WordPress) à celui servi par
l'adaptateur pg (Payload/Postgres) — E5 de plan/03-catalogue.md.

Options :
  --site=all|es|ld   Fonds à comparer (défaut : all)
  --help, -h         Affiche cette aide et quitte (aucune I/O, aucun réseau)

Sortie :
  Rapport Markdown + JSON dans ${OUT_DIR}/, et un résumé sur la sortie standard.

Code de sortie :
  0   aucun écart classé BLOQUANT
  1   au moins un écart BLOQUANT (voir le rapport), ou erreur d'exécution

Ce script est en lecture seule (aucune écriture Payload).`;

interface CliOptions {
  sites: Site[];
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let sites: Site[] = ["es", "ld"];
  let help = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") help = true;
    else if (arg.startsWith("--site=")) {
      const v = arg.slice("--site=".length);
      if (v === "all") sites = ["es", "ld"];
      else if (v === "es" || v === "ld") sites = [v];
      else throw new Error(`--site invalide : "${v}" (attendu : all|es|ld)`);
    }
  }
  return { sites, help };
}

/* ─────────────────────────── Boutique (transport local, politique partagée) ───────────────────────────
 *
 * `src/lib/boutique.ts` reste inimportable ici (`import "server-only"`), mais
 * la politique de pagination résiliente est désormais LA même module pur
 * (`src/lib/fetch-all-pages.ts`) — seul le transport (fetchWithRetry, sans
 * cache Next) reste propre à ce script. `listProducts()` est *identique* pour
 * les deux adaptateurs (`catalogue-pg.ts:58` délègue, inchangé, à
 * `getAllStoreProducts`) : un seul fetch, réutilisé des deux côtés — comparer
 * une liste à elle-même n'aurait rien appris.
 */

async function fetchStoreProducts(logger: Logger): Promise<WcProduct[]> {
  const base = process.env.WC_STORE_URL || "https://boutique.editionssociales.fr";
  const perPage = 100;
  return fetchAllPages<WcProduct>({
    perPage,
    maxPages: 10,
    fetchPage: async (page) => {
      const res = await fetchWithRetry(
        `${base}/wp-json/wc/store/v1/products?per_page=${perPage}&page=${page}&orderby=date&order=desc`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items: unknown = await res.json();
      // Ici un corps non-liste doit se VOIR (outil de recette) : on jette pour
      // qu'il soit signalé, là où les adaptateurs de l'app s'arrêtent en silence.
      if (!Array.isArray(items)) throw new Error("réponse non-liste");
      return items;
    },
    onPageError: (err, page) => {
      logger.warn(
        `[boutique] Store API indisponible (page ${page}) : ${err instanceof Error ? err.message : err} — ` +
          `catalogue comparé sans produits boutique (symétrique des deux côtés, ne crée pas de faux écart).`,
      );
    },
  });
}

/* ─────────────────────────── Payload (lecture seule) ─────────────────────────── */

/** Toutes les fiches publiées d'un fonds, avec leur doc brut (pour `wpSource`/`contentTouched`). */
async function pgBooksForEdition(payload: Payload, edition: EditionSlug): Promise<PayloadBook[]> {
  const { docs } = await payload.find({
    collection: "books",
    where: { edition: { equals: edition } },
    draft: false,
    depth: 2,
    sort: "-sortDate",
    limit: 0,
  });
  return docs;
}

/**
 * Statut courant d'une fiche d'origine WordPress dans Payload, identifié par
 * sa clé de migration `(wpSource.site, wpSource.wpId)` — `draft: true` pour
 * voir aussi les fiches passées en brouillon par le balayage des suppressions
 * (`sweepMissing`, `import.ts:649`), même requête/logique que ce balayage.
 */
async function pgStatusByWpId(
  payload: Payload,
  edition: EditionSlug,
  wpId: number,
): Promise<{ status: "draft" | "published"; slug: string } | null> {
  const { docs } = await payload.find({
    collection: "books",
    where: { and: [{ "wpSource.site": { equals: edition } }, { "wpSource.wpId": { equals: wpId } }] },
    draft: true,
    depth: 0,
    limit: 1,
  });
  const doc = docs[0];
  if (!doc) return null;
  return { status: doc._status === "draft" ? "draft" : "published", slug: doc.slug };
}

/* ─────────────────────────── Normalisation / classification des écarts ─────────────────────────── */

type Category = "bloquant" | "cosmetique" | "ignore";

interface Diff {
  key: string;
  field: string;
  category: Category;
  detail: string;
}

function diff(key: string, field: string, category: Category, detail: string): Diff {
  return { key, field, category, detail };
}

/**
 * Espaces insécables posées par l'orthotypographie française (E6 du plan —
 * NNBSP avant `; ! ?`, NBSP avant `:` et dans `« »`) : un texte identique une
 * fois ces espaces et les espaces normales normalisées n'est pas un défaut de
 * migration, seulement la fonctionnalité vendue en cours de pose.
 */
function normalizeSpaces(s: string): string {
  // Espaces ins\u00E9cables (NBSP, NNBSP) pos\u00E9es par l'orthotypographie fran\u00E7aise
  // (E6) + variantes rares (espace fine, espace de chiffre) \u2014 en \u00E9chappement
  // unicode explicite plut\u00F4t qu'en caract\u00E8re litt\u00E9ral, pour rester lisibles
  // dans un \u00E9diteur/diff et ne pas d\u00E9clencher `no-irregular-whitespace` en lint.
  return s.replace(/[\u00A0\u202F\u2009\u2007]/g, " ").replace(/\s+/g, " ").trim();
}

/** Neutralise les URL de `src=`/`href=` : un média réhébergé (OVH → Blob) ne doit pas se comparer par son URL. */
function neutralizeMediaUrls(s: string): string {
  return s.replace(/\b(src|href)="[^"]*"/gi, '$1="§"');
}

/** Diff d'un champ HTML (déjà passé par `sanitizeCms`) : espaces/URL médias whitelistés en cosmétique. */
function classifyHtml(key: string, field: string, a: string, b: string): Diff | null {
  if (a === b) return null;
  const na = normalizeSpaces(a);
  const nb = normalizeSpaces(b);
  if (na === nb) {
    return diff(key, field, "cosmetique", "espaces/insécables uniquement (orthotypographie E6 ou espacement source)");
  }
  if (neutralizeMediaUrls(na) === neutralizeMediaUrls(nb)) {
    return diff(key, field, "cosmetique", "URL de média différente, contenu identique (réhébergement OVH → Blob attendu)");
  }
  return diff(key, field, "bloquant", `contenu différent : "${a.slice(0, 120)}" ≠ "${b.slice(0, 120)}"`);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Diff d'une URL de média simple (couverture, table, extrait) : changement d'hébergeur = cosmétique, absence = bloquant. */
function classifyMediaUrl(key: string, field: string, a: string | null, b: string | null): Diff | null {
  if (a === b) return null;
  if (a == null || b == null) {
    return diff(key, field, "bloquant", `présent d'un seul côté : http="${a ?? "∅"}" pg="${b ?? "∅"}"`);
  }
  const hostA = hostOf(a);
  const hostB = hostOf(b);
  if (hostA && OVH_MEDIA_HOSTS.includes(hostA) && hostB && !OVH_MEDIA_HOSTS.includes(hostB)) {
    return diff(key, field, "cosmetique", `réhébergement attendu : ${a} → ${b}`);
  }
  return diff(key, field, "bloquant", `URL différente sans réhébergement identifiable : "${a}" ≠ "${b}"`);
}

/**
 * ISBN : `trimIsbn` (migration, `utils.ts:82`) nettoie les espaces parasites
 * connus côté LD (piège de l'échantillon E8) — un ISBN identique une fois
 * réduit aux espaces est une correction de qualité de donnée, pas une perte.
 */
function classifyIsbn(key: string, a: string | null, b: string | null): Diff | null {
  if (a === b) return null;
  if ((a ?? "").trim() === (b ?? "").trim()) {
    return diff(key, "isbn", "cosmetique", `espace parasite nettoyé : "${a}" → "${b}"`);
  }
  return diff(key, "isbn", "bloquant", `isbn différent : "${a}" ≠ "${b}"`);
}

function scalar(key: string, field: string, a: unknown, b: unknown): Diff | null {
  if (a === b) return null;
  return diff(key, field, "bloquant", `${field} : "${String(a)}" ≠ "${String(b)}"`);
}

function termsKey(terms: { slug: string }[]): string {
  return [...terms]
    .map((t) => t.slug)
    .sort()
    .join(",");
}

/** Compare deux `Book` appariés par `(edition, slug)` — champs de la vue liste. */
function diffBook(key: string, http: Book, pg: Book): Diff[] {
  const out: Diff[] = [];
  const push = (d: Diff | null) => d && out.push(d);
  push(scalar(key, "title", http.title, pg.title));
  push(classifyIsbn(key, http.isbn, pg.isbn));
  push(scalar(key, "price", http.price, pg.price));
  push(scalar(key, "pages", http.pages, pg.pages));
  push(scalar(key, "publishedAt", http.publishedAt, pg.publishedAt));
  push(scalar(key, "status", http.status, pg.status));
  push(scalar(key, "permalink", http.permalink, pg.permalink));
  push(scalar(key, "buy.boutique", http.buy.boutique, pg.buy.boutique));
  push(scalar(key, "buy.parislibrairies", http.buy.parislibrairies, pg.buy.parislibrairies));
  push(scalar(key, "buy.lalibrairie", http.buy.lalibrairie, pg.buy.lalibrairie));
  if (termsKey(http.authors) !== termsKey(pg.authors)) {
    out.push(diff(key, "authors", "bloquant", `"${termsKey(http.authors)}" ≠ "${termsKey(pg.authors)}"`));
  }
  const collA = http.collection?.slug ?? null;
  const collB = pg.collection?.slug ?? null;
  push(scalar(key, "collection", collA, collB));
  push(classifyMediaUrl(key, "cover.url", http.cover?.url ?? null, pg.cover?.url ?? null));
  if (http.cover && pg.cover && (http.cover.width !== pg.cover.width || http.cover.height !== pg.cover.height)) {
    out.push(
      diff(
        key,
        "cover.dims",
        "bloquant",
        `${http.cover.width}x${http.cover.height} ≠ ${pg.cover.width}x${pg.cover.height}`,
      ),
    );
  }
  return out;
}

/** Compare deux `BookDetail` (HTML post-`sanitizeCms` + URL PDF). */
function diffBookDetail(key: string, http: BookDetail, pg: BookDetail): Diff[] {
  const out: Diff[] = [];
  const push = (d: Diff | null) => d && out.push(d);
  push(classifyHtml(key, "presentation", http.presentation, pg.presentation));
  push(classifyHtml(key, "furtherReading", http.furtherReading ?? "", pg.furtherReading ?? ""));
  push(classifyMediaUrl(key, "tocUrl", http.tocUrl, pg.tocUrl));
  push(classifyMediaUrl(key, "excerptUrl", http.excerptUrl, pg.excerptUrl));
  return out;
}

/* ─────────────────────────── Facettes / nouveautés ─────────────────────────── */

function facetKey(facets: Facet[]): string {
  return [...facets]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((f) => `${f.slug}:${f.count}`)
    .join(",");
}

function diffFacets(
  http: { collections: Facet[]; authors: Facet[]; total: number },
  pg: { collections: Facet[]; authors: Facet[]; total: number },
): Diff[] {
  const out: Diff[] = [];
  if (facetKey(http.collections) !== facetKey(pg.collections)) {
    out.push(
      diff("(global)", "facets.collections", "bloquant", `"${facetKey(http.collections)}" ≠ "${facetKey(pg.collections)}"`),
    );
  }
  if (facetKey(http.authors) !== facetKey(pg.authors)) {
    out.push(diff("(global)", "facets.authors", "bloquant", `"${facetKey(http.authors)}" ≠ "${facetKey(pg.authors)}"`));
  }
  if (http.total !== pg.total) {
    out.push(diff("(global)", "facets.total", "bloquant", `${http.total} ≠ ${pg.total}`));
  }
  return out;
}

function bookKey(b: Book): string {
  return `${b.edition ?? "boutique"}:${b.slug}`;
}

/** Nouveautés : la **séquence** compte (correction de tri v1 du plan, E4 — `sortDate` vs `wpSource.wpDate`). */
function diffNewReleases(http: Book[], pg: Book[]): Diff[] {
  const a = http.map(bookKey);
  const b = pg.map(bookKey);
  if (a.join("|") === b.join("|")) return [];
  return [diff("(global)", "newReleases", "bloquant", `ordre/contenu différent : [${a.join(", ")}] ≠ [${b.join(", ")}]`)];
}

/* ─────────────────────────── 0 URL OVH résiduelle (condition d'extinction E11) ─────────────────────────── */

interface OvhResidual {
  key: string;
  field: string;
  url: string;
}

function findOvhUrls(key: string, field: string, haystack: string | null | undefined): OvhResidual[] {
  if (!haystack) return [];
  const out: OvhResidual[] = [];
  const re = /https?:\/\/[^\s"'<>]+/gi;
  for (const m of haystack.matchAll(re)) {
    const host = hostOf(m[0]);
    if (host && OVH_MEDIA_HOSTS.includes(host)) out.push({ key, field, url: m[0] });
  }
  return out;
}

/** Scanne un `BookDetail` pg + le doc Payload brut (`coverFallbackUrl`) — cible unique de ce contrôle. */
function scanOvhResiduals(key: string, detail: BookDetail, raw: PayloadBook): OvhResidual[] {
  return [
    ...findOvhUrls(key, "presentation", detail.presentation),
    ...findOvhUrls(key, "furtherReading", detail.furtherReading),
    ...findOvhUrls(key, "cover.url", detail.cover?.url ?? null),
    ...findOvhUrls(key, "tocUrl", detail.tocUrl),
    ...findOvhUrls(key, "excerptUrl", detail.excerptUrl),
    ...findOvhUrls(key, "coverFallbackUrl", raw.coverFallbackUrl),
  ];
}

/* ─────────────────────────── Orchestration ─────────────────────────── */

interface SiteReport {
  site: Site;
  httpCaptured: number;
  pgPublished: number;
  matched: number;
  httpOnly: Diff[];
  pgOnly: Diff[];
  detailCompared: number;
  detailSkippedEdited: number;
}

interface Report {
  startedAt: number;
  sites: SiteReport[];
  diffs: Diff[];
  ovhResiduals: OvhResidual[];
}

async function compareSite(
  payload: Payload,
  site: Site,
  logger: Logger,
  products: WcProduct[],
): Promise<{ report: SiteReport; diffs: Diff[]; ovh: OvhResidual[]; httpBooks: Book[]; pgBooks: Book[] }> {
  const edition = EDITION_BY_SITE[site];
  await healthCheck(site);

  // `WpCatalogueRaw` (fetch-wp.ts) est structurellement un sur-ensemble de
  // `WpBook` (catalogue-source.ts) — même `book: WpBookField`, plus `date` —
  // et inclut déjà `content` (contrairement à `catalogue-http.ts:listBooks`,
  // qui l'omet pour l'usage prod) : un seul passage REST donne ici à la fois
  // la liste **et** le détail de chaque fiche, pas besoin d'un fetch par livre.
  const httpRaw = (await fetchCatalogue(site, logger)) as WpBook[];
  const pgRaw = await pgBooksForEdition(payload, edition);
  const pgAsWpBook = pgRaw.map(payloadBookToWpBook);

  const httpBySlug = new Map(httpRaw.map((b) => [b.slug, b]));
  const pgBySlug = new Map(pgRaw.map((doc, i) => [doc.slug, { doc, wpBook: pgAsWpBook[i] }]));

  const diffs: Diff[] = [];
  const ovh: OvhResidual[] = [];
  const httpOnly: Diff[] = [];
  const pgOnly: Diff[] = [];
  let matched = 0;
  let detailCompared = 0;
  let detailSkippedEdited = 0;

  for (const [slug, httpItem] of httpBySlug) {
    const key = `${edition}:${slug}`;
    const pgEntry = pgBySlug.get(slug);
    if (!pgEntry) {
      const status = await pgStatusByWpId(payload, edition, httpItem.id);
      if (status?.status === "draft") {
        httpOnly.push(
          diff(key, "présence", "ignore", `absent de pg — passé en draft par le balayage des suppressions (${status.slug})`),
        );
      } else if (status?.status === "published") {
        httpOnly.push(
          diff(key, "présence", "bloquant", `slug pg publié divergent pour ce wpId : "${slug}" ≠ "${status.slug}" (renommage ?)`),
        );
      } else {
        httpOnly.push(diff(key, "présence", "bloquant", "présent côté WordPress, jamais importé dans Payload"));
      }
      continue;
    }
    matched++;

    const httpBook = toBookLike(edition, httpItem, products);
    const pgBook = toBookLike(edition, pgEntry.wpBook, products);
    diffs.push(...diffBook(key, httpBook, pgBook));

    if (pgEntry.doc.contentTouched) {
      // Fiche réellement rééditée dans Payload (parachute `*LegacyHtml`,
      // `site/CLAUDE.md`) : le HTML sert désormais le Lexical réédité, une
      // divergence avec le WordPress figé n'est pas un défaut de migration.
      detailSkippedEdited++;
    } else {
      detailCompared++;
      const httpDetail = buildBookDetail(edition, httpItem, products);
      const pgDetail = buildBookDetail(edition, pgEntry.wpBook, products);
      diffs.push(...diffBookDetail(key, httpDetail, pgDetail));
      ovh.push(...scanOvhResiduals(key, pgDetail, pgEntry.doc));
    }
  }

  for (const [slug, pgEntry] of pgBySlug) {
    if (httpBySlug.has(slug)) continue;
    const key = `${edition}:${slug}`;
    const wpSource = pgEntry.doc.wpSource;
    if (!wpSource?.site || wpSource.wpId == null) {
      pgOnly.push(diff(key, "présence", "ignore", "née dans Payload (pas d'origine WordPress) — bac à essai ou fiche éditoriale"));
    } else {
      pgOnly.push(
        diff(
          key,
          "présence",
          "bloquant",
          `publiée en base (wpId ${wpSource.wpId}) mais absente de la capture WP courante — ` +
            `balayage des suppressions à rejouer (re-run de migrate:catalogue), ou capture WP tronquée`,
        ),
      );
    }
  }

  const report: SiteReport = {
    site,
    httpCaptured: httpRaw.length,
    pgPublished: pgRaw.length,
    matched,
    httpOnly,
    pgOnly,
    detailCompared,
    detailSkippedEdited,
  };

  const httpBooks = httpRaw.map((b) => toBookLike(edition, b, products));
  const pgBooks = pgAsWpBook.map((b) => toBookLike(edition, b, products));
  return { report, diffs: [...diffs, ...httpOnly, ...pgOnly], ovh, httpBooks, pgBooks };
}

/**
 * `toBook`/`resolvePurchase` de `catalogue-core.ts` ne sont pas exportés —
 * seul `buildCatalogue` l'est. Un livre à la fois, avec les vrais produits
 * boutique (mêmes des deux côtés, E4) : sans eux, `status`/`permalink`/`price`
 * seraient toujours résolus à vide et une vraie divergence de mapping du lien
 * boutique (`buy.boutique`) passerait inaperçue.
 */
function toBookLike(edition: EditionSlug, item: WpBook, products: WcProduct[]): Book {
  return buildCatalogue({ [edition]: [item] }, products)[0];
}

/* ─────────────────────────── Rapport ─────────────────────────── */

function buildMarkdown(input: Report): string {
  const lines: string[] = [];
  const bloquants = input.diffs.filter((d) => d.category === "bloquant");
  const cosmetiques = input.diffs.filter((d) => d.category === "cosmetique");
  const ignores = input.diffs.filter((d) => d.category === "ignore");
  const durationS = ((Date.now() - input.startedAt) / 1000).toFixed(1);

  lines.push("# Rapport de parité http ⟷ pg", "");
  lines.push(
    `Durée : ${durationS}s · **${bloquants.length} bloquant(s)** · ${cosmetiques.length} cosmétique(s) · ` +
      `${ignores.length} ignoré(s)/whitelisté(s) · ${input.ovhResiduals.length} URL OVH résiduelle(s).`,
    "",
  );

  lines.push("## Comptages par fonds", "");
  for (const s of input.sites) {
    lines.push(
      `- **${SITE_LABEL[s.site]}** : ${s.httpCaptured} captée(s) WP · ${s.pgPublished} publiée(s) pg · ` +
        `${s.matched} appariée(s) · fiche(s) détail comparée(s) : ${s.detailCompared} ` +
        `(${s.detailSkippedEdited} réédité(s) dans Payload, non comparée(s)).`,
    );
  }
  lines.push("");

  lines.push("## Écarts BLOQUANTS", "");
  if (bloquants.length === 0) lines.push("Aucun.");
  else for (const d of bloquants) lines.push(`- \`${d.key}\` **${d.field}** : ${d.detail}`);
  lines.push("");

  lines.push("## Écarts cosmétiques (whitelistés — non bloquants)", "");
  if (cosmetiques.length === 0) lines.push("Aucun.");
  else for (const d of cosmetiques) lines.push(`- \`${d.key}\` **${d.field}** : ${d.detail}`);
  lines.push("");

  lines.push("## Ignorés (suppressions balayées / fiches nées dans Payload)", "");
  if (ignores.length === 0) lines.push("Aucun.");
  else for (const d of ignores) lines.push(`- \`${d.key}\` : ${d.detail}`);
  lines.push("");

  lines.push("## Contrôle « 0 URL OVH résiduelle » (condition d'extinction E11)", "");
  if (input.ovhResiduals.length === 0) {
    lines.push("Aucune — condition remplie.");
  } else {
    lines.push(`⚠️ ${input.ovhResiduals.length} URL OVH trouvée(s) dans les champs média servis par pg :`);
    for (const o of input.ovhResiduals) lines.push(`- \`${o.key}\` **${o.field}** → ${o.url}`);
  }
  lines.push("");

  return lines.join("\n");
}

function buildJson(input: Report): unknown {
  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - input.startedAt,
    sites: input.sites,
    diffs: input.diffs,
    ovhResiduals: input.ovhResiduals,
    summary: {
      bloquants: input.diffs.filter((d) => d.category === "bloquant").length,
      cosmetiques: input.diffs.filter((d) => d.category === "cosmetique").length,
      ignores: input.diffs.filter((d) => d.category === "ignore").length,
      ovhResiduals: input.ovhResiduals.length,
    },
  };
}

async function writeReport(input: Report): Promise<{ mdPath: string; jsonPath: string }> {
  await mkdir(OUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const mdPath = path.join(OUT_DIR, `compare-${ts}.md`);
  const jsonPath = path.join(OUT_DIR, `compare-${ts}.json`);
  await writeFile(mdPath, buildMarkdown(input), "utf8");
  await writeFile(jsonPath, JSON.stringify(buildJson(input), null, 2), "utf8");
  return { mdPath, jsonPath };
}

/* ─────────────────────────── main ─────────────────────────── */

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return 0;
  }

  const startedAt = Date.now();
  const logger = createLogger();
  logger.info(`[compare-sources] démarrage — sites=${opts.sites.join(",")}`);

  const payload = await getPayload({ config });
  try {
    // Boutique unique (E4 : `listProducts` identique des deux côtés) — un
    // seul fetch, servi tel quel aux deux adaptateurs pour que `status` /
    // `permalink` / `price` se résolvent réellement (pas juste symétriquement
    // à vide) et que le mapping du lien boutique (`buy.boutique`) soit vérifié.
    const products = await fetchStoreProducts(logger);

    const diffs: Diff[] = [];
    const ovhResiduals: OvhResidual[] = [];
    const sites: SiteReport[] = [];
    const allHttp: Book[] = [];
    const allPg: Book[] = [];

    for (const site of opts.sites) {
      const { report, diffs: siteDiffs, ovh, httpBooks, pgBooks } = await compareSite(payload, site, logger, products);
      sites.push(report);
      diffs.push(...siteDiffs);
      ovhResiduals.push(...ovh);
      allHttp.push(...httpBooks);
      allPg.push(...pgBooks);
    }

    // Ajout des articles boutique sans fiche catalogue (déjà résolus dans les
    // `Book[]` par fonds ci-dessus) — même règle que la façade
    // (`catalogue.ts:getAllBooks`), pour que facettes/nouveautés voient
    // exactement la même vue fusionnée tous-fonds + boutique.
    const httpCatalogue = [...allHttp, ...boutiqueExtras(products, allHttp)];
    const pgCatalogue = [...allPg, ...boutiqueExtras(products, allPg)];

    diffs.push(...diffFacets(computeFacets(httpCatalogue), computeFacets(pgCatalogue)));
    diffs.push(
      ...diffNewReleases(
        newReleases(queryBooks(httpCatalogue, { sort: "recent" })),
        newReleases(queryBooks(pgCatalogue, { sort: "recent" })),
      ),
    );

    const report: Report = { startedAt, sites, diffs, ovhResiduals };
    const { mdPath, jsonPath } = await writeReport(report);
    const bloquants = diffs.filter((d) => d.category === "bloquant").length + ovhResiduals.length;

    logger.info(`[compare-sources] rapport écrit : ${mdPath} / ${jsonPath}`);
    logger.info(
      `[compare-sources] terminé en ${((Date.now() - startedAt) / 1000).toFixed(1)}s — ` +
        `${bloquants} bloquant(s) (attendu 0).`,
    );
    return bloquants > 0 ? 1 : 0;
  } finally {
    await payload.destroy();
  }
}

/**
 * Articles boutique sans fiche catalogue (produits jamais réclamés par un
 * livre des deux fonds réunis) — `toBookLike` résout déjà `buy.boutique` fonds
 * par fonds via `buildCatalogue`, mais cet appel ne voit qu'un livre à la fois
 * et ne peut donc pas savoir quels produits restent orphelins à l'échelle du
 * catalogue entier ; on rejoue ici la même règle de réclamation
 * (`slugFromBoutiqueLink`) globalement, pour que `computeFacets`/`newReleases`
 * voient exactement la vue fusionnée de `catalogue.ts:getAllBooks`.
 */
function boutiqueExtras(products: WcProduct[], books: Book[]): Book[] {
  const claimedSlugs = new Set(
    books.flatMap((b) => {
      const slug = slugFromBoutiqueLink(b.buy.boutique);
      return slug ? [slug] : [];
    }),
  );
  return buildCatalogue({}, products.filter((p) => !claimedSlugs.has(p.slug)));
}

// Top-level await obligatoire : `payload run` fait `process.exit(0)` dès que
// l'import du module est résolu (même contrainte que `migrate-catalogue/index.ts`).
try {
  const code = await main();
  process.exit(code);
} catch (err) {
  console.error("[compare-sources] ÉCHEC —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
}
