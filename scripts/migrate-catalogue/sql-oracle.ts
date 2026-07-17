/**
 * Oracle secondaire : les dumps SQL locaux (MariaDB `127.0.0.1:3307`, `mysql2`),
 * pour tout ce que le REST ne garantit pas — piège `plus_loin` ES, comptages,
 * inventaire des liens boutique, preuve de non-perte des « biographies ».
 *
 * Le REST (`fetch-wp.ts`) reste la source primaire des données ; cette base
 * n'est jamais écrite, jamais utilisée pour autre chose que vérifier/patcher
 * ponctuellement le champ `plus_loin` côté ES.
 *
 * `slugFromBoutiqueLink` est importé (relatif) depuis `src/lib/catalogue-source.ts`
 * plutôt que recopié : l'alias `@/*` n'est pas fiable sous `payload run`, mais
 * l'import RELATIF fonctionne — même mécanisme déjà prouvé par
 * `scripts/compare-sources.ts` (l.47) sous le même `payload run`.
 */
import mysql from "mysql2/promise";

import { slugFromBoutiqueLink } from "../../src/lib/catalogue-source.ts";

import type { WpCatalogueRaw } from "./fetch-wp.ts";
import { type Logger, type Site } from "./utils.ts";

const HOST = process.env.CATALOG_ORACLE_HOST || "127.0.0.1";
const PORT = Number(process.env.CATALOG_ORACLE_PORT || "3307");
const USER = process.env.CATALOG_ORACLE_USER || "root";
const PASSWORD = process.env.CATALOG_ORACLE_PASSWORD || "";

const DB_BY_SITE: Record<Site, string> = { es: "editionskes", ld: "editionsk712" };
/** Base Boutique — même instance MariaDB (R2). Vérification best-effort : si
 * absente, l'inventaire des liens boutique est simplement marqué non vérifié
 * (jamais bloquant, ce n'est qu'un contrôle diagnostique). */
const BOUTIQUE_DB = process.env.CATALOG_ORACLE_BOUTIQUE_DB || "editionsk884";

async function connectTo(database: string) {
  return mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD, database });
}

/** Découvre le préfixe des tables (`es_`, `wp_`, …) par `SHOW TABLES` — ne jamais le supposer. */
async function discoverPrefix(conn: mysql.Connection): Promise<string> {
  const [rows] = await conn.query("SHOW TABLES");
  const names = (rows as Record<string, string>[]).map((r) => Object.values(r)[0] as string);
  for (const name of names) {
    if (name.endsWith("posts")) {
      const prefix = name.slice(0, name.length - "posts".length);
      if (names.includes(`${prefix}postmeta`)) return prefix;
    }
  }
  throw new Error(
    `[sql-oracle] préfixe de tables introuvable sur la base courante (aucune paire */posts+postmeta cohérente).`,
  );
}

export interface PlusLoinPatch {
  site: Site;
  wpId: number;
  slug: string;
  value: string;
  /** D'où vient la valeur retenue : utile au rapport. */
  from: "pour_aller_plus_loin" | "plus_loin";
}

export interface BoutiqueLinkCheck {
  site: Site;
  wpId: number;
  slug: string;
  url: string;
  matchedProductSlug: string | null;
  broken: boolean;
}

export interface TermDescriptionLeak {
  site: Site;
  taxonomy: "auteur" | "collection";
  termId: number;
  slug: string;
  description: string;
}

export interface OracleReport {
  /** Comptages `post_type='catalogue' AND post_status='publish'` par site (attendus 117/178, LD dump = 176). */
  sqlCounts: Record<Site, number>;
  /** IDs présents dans la capture REST mais absents du dump SQL (fiches créées après le dump — pas des anomalies). */
  restOnly: { site: Site; wpId: number; slug: string }[];
  /** Patchs à appliquer sur `plusLoin` (ES uniquement) : REST null, SQL non vide. */
  plusLoinPatches: PlusLoinPatch[];
  /** Taux de remplissage mesurés en base, par site (comparés aux attendus dans `report.ts`). */
  fillRates: Record<Site, Record<string, number>>;
  /** Descriptions de termes auteur/collection non vides — attendu : liste vide (preuve de non-perte des bios). */
  termDescriptionLeaks: TermDescriptionLeak[];
  /** Inventaire des liens boutique ; `null` si la base Boutique est injoignable (best-effort, non bloquant). */
  boutiqueLinks: BoutiqueLinkCheck[] | null;
}

function coalesceNullIf(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (v != null && v.trim() !== "") return v;
  }
  return null;
}

/** Lit la réconciliation `plus_loin`/`pour_aller_plus_loin` + comptages + descriptions de termes pour un site. */
async function runOracleForSite(
  site: Site,
  items: WpCatalogueRaw[],
  logger: Logger,
): Promise<Pick<OracleReport, "sqlCounts" | "restOnly" | "plusLoinPatches" | "fillRates" | "termDescriptionLeaks">> {
  const conn = await connectTo(DB_BY_SITE[site]);
  try {
    const prefix = await discoverPrefix(conn);
    logger.info(`[sql-oracle] ${site} (${DB_BY_SITE[site]}) : préfixe de tables "${prefix}".`);

    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS n FROM ${prefix}posts WHERE post_type = 'catalogue' AND post_status = 'publish'`,
    );
    const sqlCount = Number((countRows as { n: number }[])[0]?.n ?? 0);

    const [idRows] = await conn.query(
      `SELECT ID, post_name FROM ${prefix}posts WHERE post_type = 'catalogue' AND post_status = 'publish'`,
    );
    const sqlIds = new Set((idRows as { ID: number }[]).map((r) => r.ID));

    const restOnly = items
      .filter((it) => !sqlIds.has(it.id))
      .map((it) => ({ site, wpId: it.id, slug: it.slug }));
    if (restOnly.length > 0) {
      logger.info(
        `[sql-oracle] ${site} : ${restOnly.length} fiche(s) « REST seul » (postérieures au dump, pas une anomalie) : ` +
          restOnly.map((r) => r.slug).join(", "),
      );
    }

    // Réconciliation plus_loin / pour_aller_plus_loin (piège ES — R2 §1.3).
    // Restreint aux posts `catalogue`/`publish` (`sqlIds`) : `postmeta` est une
    // table générique par `post_id`, sans garantie que ces meta_keys ne soient
    // pas réutilisés ailleurs (CPT `livre` legacy notamment).
    const [metaRows] = await conn.query(
      `SELECT post_id, meta_key, meta_value FROM ${prefix}postmeta WHERE meta_key IN ('plus_loin','pour_aller_plus_loin')`,
    );
    const byPost = new Map<number, { plus_loin?: string; pour_aller_plus_loin?: string }>();
    for (const row of metaRows as { post_id: number; meta_key: string; meta_value: string }[]) {
      if (!sqlIds.has(row.post_id)) continue;
      const entry = byPost.get(row.post_id) ?? {};
      if (row.meta_key === "plus_loin") entry.plus_loin = row.meta_value;
      else entry.pour_aller_plus_loin = row.meta_value;
      byPost.set(row.post_id, entry);
    }

    const plusLoinPatches: PlusLoinPatch[] = [];
    if (site === "es") {
      const bySlugItem = new Map(items.map((it) => [it.id, it]));
      for (const [postId, entry] of byPost) {
        const coalesced = coalesceNullIf(entry.pour_aller_plus_loin, entry.plus_loin);
        if (!coalesced) continue;
        const item = bySlugItem.get(postId);
        if (!item) continue; // fiche supprimée depuis le dump, hors périmètre du patch
        const restValue = item.book?.plus_loin;
        if (restValue == null || restValue.trim() === "") {
          plusLoinPatches.push({
            site,
            wpId: postId,
            slug: item.slug,
            value: coalesced,
            from: entry.pour_aller_plus_loin ? "pour_aller_plus_loin" : "plus_loin",
          });
        }
      }
      if (plusLoinPatches.length > 0) {
        logger.info(
          `[sql-oracle] ES : ${plusLoinPatches.length} fiche(s) à patcher pour "plus_loin" (REST null, SQL non vide).`,
        );
      }
    }

    // Taux de remplissage (postmeta non vides) — comparés aux attendus dans report.ts.
    const metaKeys = [
      "isbn",
      "date_parution",
      "prix",
      "nombre_pages",
      "lalibrairie",
      "parislibrairies",
      "boutique_es",
      "table",
      "extrait_choisi",
    ];
    const fillRates: Record<string, number> = {};
    for (const key of metaKeys) {
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS n FROM ${prefix}postmeta pm
         JOIN ${prefix}posts p ON p.ID = pm.post_id
         WHERE pm.meta_key = ? AND pm.meta_value <> ''
           AND p.post_type = 'catalogue' AND p.post_status = 'publish'`,
        [key],
      );
      fillRates[key] = Number((rows as { n: number }[])[0]?.n ?? 0);
    }
    // plus_loin : coalescé sur les deux clés partout (LD n'a jamais
    // `pour_aller_plus_loin` renseigné — `coalesceNullIf` retombe alors
    // simplement sur `plus_loin` seul, sans branche séparée à maintenir).
    {
      let nonEmpty = 0;
      for (const entry of byPost.values()) {
        if (coalesceNullIf(entry.pour_aller_plus_loin, entry.plus_loin)) nonEmpty++;
      }
      fillRates["plus_loin_coalesced"] = nonEmpty;
    }

    // Descriptions de termes auteur/collection — attendu : aucune non vide.
    const [descRows] = await conn.query(
      `SELECT tt.term_id AS term_id, tt.taxonomy AS taxonomy, t.slug AS slug, tt.description AS description
       FROM ${prefix}term_taxonomy tt
       JOIN ${prefix}terms t ON t.term_id = tt.term_id
       WHERE tt.taxonomy IN ('auteur','collection') AND tt.description <> ''`,
    );
    const termDescriptionLeaks: TermDescriptionLeak[] = (
      descRows as { term_id: number; taxonomy: "auteur" | "collection"; slug: string; description: string }[]
    ).map((r) => ({
      site,
      taxonomy: r.taxonomy,
      termId: r.term_id,
      slug: r.slug,
      description: r.description,
    }));

    return {
      sqlCounts: { [site]: sqlCount } as Record<Site, number>,
      restOnly,
      plusLoinPatches,
      fillRates: { [site]: fillRates } as Record<Site, Record<string, number>>,
      termDescriptionLeaks,
    };
  } finally {
    await conn.end();
  }
}

/** Inventaire des liens boutique (best-effort — base Boutique optionnelle, jamais bloquant). */
async function checkBoutiqueLinks(
  restItems: Record<Site, WpCatalogueRaw[]>,
  logger: Logger,
): Promise<BoutiqueLinkCheck[] | null> {
  let conn: mysql.Connection;
  try {
    conn = await connectTo(BOUTIQUE_DB);
  } catch (err) {
    logger.warn(
      `[sql-oracle] base Boutique (${BOUTIQUE_DB}) injoignable — inventaire des liens boutique non vérifié en base (${err instanceof Error ? err.message : err}).`,
    );
    return null;
  }
  try {
    const prefix = await discoverPrefix(conn);
    const results: BoutiqueLinkCheck[] = [];
    for (const site of Object.keys(restItems) as Site[]) {
      for (const item of restItems[site]) {
        const url = item.book?.boutique;
        if (!url) continue;
        const slug = slugFromBoutiqueLink(url);
        if (!slug) {
          results.push({ site, wpId: item.id, slug: item.slug, url, matchedProductSlug: null, broken: true });
          continue;
        }
        const [rows] = await conn.query(
          `SELECT post_name FROM ${prefix}posts WHERE post_type = 'product' AND post_status = 'publish' AND post_name = ? LIMIT 1`,
          [slug],
        );
        const matched = Array.isArray(rows) && (rows as unknown[]).length > 0;
        results.push({
          site,
          wpId: item.id,
          slug: item.slug,
          url,
          matchedProductSlug: matched ? slug : null,
          broken: !matched,
        });
      }
    }
    const broken = results.filter((r) => r.broken);
    logger.info(
      `[sql-oracle] Boutique : ${results.length} lien(s) inventorié(s), ${broken.length} cassé(s) (attendu : 9).`,
    );
    return results;
  } finally {
    await conn.end();
  }
}

/** Exécute l'oracle SQL pour les sites demandés et fusionne les rapports. */
export async function runOracle(
  sites: Site[],
  restItems: Record<Site, WpCatalogueRaw[]>,
  logger: Logger,
): Promise<OracleReport> {
  const sqlCounts = {} as Record<Site, number>;
  const fillRates = {} as Record<Site, Record<string, number>>;
  let restOnly: OracleReport["restOnly"] = [];
  let plusLoinPatches: PlusLoinPatch[] = [];
  let termDescriptionLeaks: TermDescriptionLeak[] = [];

  for (const site of sites) {
    const partial = await runOracleForSite(site, restItems[site] ?? [], logger);
    Object.assign(sqlCounts, partial.sqlCounts);
    Object.assign(fillRates, partial.fillRates);
    restOnly = restOnly.concat(partial.restOnly);
    plusLoinPatches = plusLoinPatches.concat(partial.plusLoinPatches);
    termDescriptionLeaks = termDescriptionLeaks.concat(partial.termDescriptionLeaks);
  }

  const boutiqueLinks = await checkBoutiqueLinks(restItems, logger);

  return { sqlCounts, restOnly, plusLoinPatches, fillRates, termDescriptionLeaks, boutiqueLinks };
}
