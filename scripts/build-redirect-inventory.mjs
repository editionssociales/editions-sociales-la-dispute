#!/usr/bin/env node
/**
 * E4 du plan (`plan/02-mise-en-production.md`) — génère
 * `scripts/redirect-inventory.csv` (colonnes `host,path,expected_status,
 * expected_location`), l'inventaire exhaustif servant à *prouver* que les
 * règles de `next.config.ts` (`redirects()`) couvrent bien toutes les URLs
 * réelles des deux WordPress, pas seulement les formes génériques.
 *
 * Trois sources, dans l'ordre :
 *   (a) MariaDB locale des dumps SQL (`127.0.0.1:3307`, mêmes bases que
 *       `scripts/migrate-catalogue/sql-oracle.ts` — `CATALOG_ORACLE_*`) :
 *       pages publiées + termes `auteur`/`collection` avec `count > 0` (+
 *       `parution`).
 *   (b) le REST live (`WP_ES_URL`/`WP_LD_URL`) pour les slugs de fiches —
 *       plus frais que le dump SQL (fiches créées après le dernier export).
 *   (c) un échantillon d'URLs `/wp-content/uploads/…` extraites des mêmes
 *       réponses REST (couvertures + PDF des champs `table`/`extrait`).
 *
 * Ce script suppose un réseau (REST live) et une MariaDB locale sur le poste
 * de l'exécutant — il échouera avec un message explicite si l'un ou l'autre
 * est absent (CI, environnement sans réseau) : c'est attendu, pas une
 * régression à corriger ici.
 *
 * `expected_status` reflète `REDIRECTS_PERMANENT` **au moment de la
 * génération** (302 par défaut, 301 si posée à "1") — cf. `r()`/`t()` de
 * `next.config.ts`. Comme les patterns eux-mêmes, cet inventaire est
 * régénéré à chaque étape (E5, E6, E7) plutôt que figé une fois pour toutes.
 *
 * Usage : `node scripts/build-redirect-inventory.mjs`
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const REDIRECTS_PERMANENT = process.env.REDIRECTS_PERMANENT === "1";
/** Cf. `next.config.ts` : `r()` suit `REDIRECTS_PERMANENT`, `t()` reste toujours temporaire. */
const STATUS_R = REDIRECTS_PERMANENT ? 301 : 302;
const STATUS_T = 302;

const OUT_FILE = path.join(process.cwd(), "scripts/redirect-inventory.csv");

/* ───────────────────────── (a) MariaDB locale (:3307) ─────────────────────────
 * Même instance et mêmes bases que `scripts/migrate-catalogue/sql-oracle.ts` :
 * un seul jeu de dumps SQL locaux, réutilisé plutôt que dupliqué.
 */

const DB_HOST = process.env.CATALOG_ORACLE_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.CATALOG_ORACLE_PORT || "3307");
const DB_USER = process.env.CATALOG_ORACLE_USER || "root";
const DB_PASSWORD = process.env.CATALOG_ORACLE_PASSWORD || "";
/** Bases vérifiées dans `LEGACY-STACK.md` §4/§5 : catalogue ES et LD, préfixe `es_` (découvert dynamiquement, jamais supposé). */
const DB_BY_SITE = { es: "editionskes", ld: "editionsk712" };

async function connectTo(database) {
  let mysql;
  try {
    mysql = await import("mysql2/promise");
  } catch (err) {
    throw new Error(
      `[build-redirect-inventory] dépendance "mysql2" introuvable : ${err.message}\n` +
        `→ "mysql2" est une devDependency (pnpm install requis, réseau nécessaire hors lockfile déjà posé).`,
    );
  }
  try {
    return await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database,
    });
  } catch (err) {
    throw new Error(
      `[build-redirect-inventory] MariaDB locale injoignable (${DB_HOST}:${DB_PORT}, base "${database}") : ` +
        `${err instanceof Error ? err.message : err}\n` +
        `→ Ce script suppose la MariaDB locale des dumps SQL démarrée sur le port 3307 ` +
        `(cf. LEGACY-STACK.md §1.3, README.md « dev local (MariaDB 3307) »). Hors de cet ` +
        `environnement (CI, réseau/poste sans les dumps), l'échec est attendu — pas une régression.`,
    );
  }
}

/** Préfixe des tables (`es_`, `wp_`…) découvert par `SHOW TABLES` — jamais supposé. */
async function discoverPrefix(conn) {
  const [rows] = await conn.query("SHOW TABLES");
  const names = rows.map((r) => Object.values(r)[0]);
  for (const name of names) {
    if (name.endsWith("posts")) {
      const prefix = name.slice(0, name.length - "posts".length);
      if (names.includes(`${prefix}postmeta`)) return prefix;
    }
  }
  throw new Error(`[build-redirect-inventory] préfixe de tables introuvable sur la base courante (aucune paire */posts+postmeta).`);
}

async function publishedPageSlugs(conn, prefix) {
  const [rows] = await conn.query(
    `SELECT post_name FROM ${prefix}posts WHERE post_type = 'page' AND post_status = 'publish' AND post_name <> ''`,
  );
  return rows.map((r) => r.post_name);
}

/** Termes d'une taxonomie avec `count > 0` (archives réellement navigables, pas les termes orphelins). */
async function termsWithCount(conn, prefix, taxonomy) {
  const [rows] = await conn.query(
    `SELECT t.slug AS slug FROM ${prefix}term_taxonomy tt
     JOIN ${prefix}terms t ON t.term_id = tt.term_id
     WHERE tt.taxonomy = ? AND tt.count > 0`,
    [taxonomy],
  );
  return rows.map((r) => r.slug);
}

/* ───────────────────── (b) REST live — slugs frais + champ `book` ───────────────────── */

const SITE_BASES = {
  es: process.env.WP_ES_URL || "https://editionssociales.fr",
  ld: process.env.WP_LD_URL || "https://ladispute.fr",
};

async function restCatalogueItems(site) {
  const base = SITE_BASES[site];
  const perPage = 100;
  const items = [];
  for (let page = 1; ; page += 1) {
    const url = `${base}/wp-json/wp/v2/catalogue?per_page=${perPage}&page=${page}&_fields=slug,book`;
    let res;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (err) {
      throw new Error(
        `[build-redirect-inventory] REST ${site} (${base}) injoignable : ${err instanceof Error ? err.message : err}\n` +
          `→ Réseau requis pour cette étape (échantillon de slugs/médias frais) ; attendu hors ligne.`,
      );
    }
    if (res.status === 400 && page > 1) break; // `rest_post_invalid_page_number` : dernière page dépassée
    if (!res.ok) {
      throw new Error(`[build-redirect-inventory] REST ${site} (${base}) → HTTP ${res.status} (attendu 200).`);
    }
    const body = await res.json();
    if (!Array.isArray(body) || body.length === 0) break;
    items.push(...body);
    if (body.length < perPage) break;
  }
  return items;
}

/* ───────────────────── (c) échantillon d'URLs `/wp-content/uploads/…` ───────────────────── */

/** Extrait un chemin `/wp-content/…` d'une URL absolue historique (couverture, `table`, `extrait`). */
function wpContentPathOf(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const m = /^https?:\/\/[^/]+(\/wp-content\/.*)$/i.exec(rawUrl);
  return m ? m[1] : null;
}

function sampleMediaPaths(items, max = 15) {
  const paths = new Set();
  for (const item of items) {
    const book = item.book || {};
    const cover = typeof book.cover === "string" ? book.cover : book.cover?.url;
    for (const raw of [cover, book.table, book.extrait]) {
      const p = wpContentPathOf(raw);
      if (p) paths.add(p);
      if (paths.size >= max) return [...paths];
    }
  }
  return [...paths];
}

/* ───────────────────────── construction des lignes CSV ───────────────────────── */

function csvField(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(host, urlPath, status, location) {
  return [host, urlPath, status, location].map(csvField).join(",");
}

async function buildEsRows() {
  const rows = [];

  const conn = await connectTo(DB_BY_SITE.es);
  let pages, auteurs, collections;
  try {
    const prefix = await discoverPrefix(conn);
    pages = await publishedPageSlugs(conn, prefix);
    auteurs = await termsWithCount(conn, prefix, "auteur");
    collections = await termsWithCount(conn, prefix, "collection");
  } finally {
    await conn.end();
  }

  // Pages WP publiées : trace diagnostique (aucune ligne dédiée — elles sont
  // soit nativement servies par le nouveau site (`/a-propos`…), soit couvertes
  // par les règles nommées ci-dessous). Gardé en commentaire de rapport plutôt
  // qu'ignoré silencieusement.
  console.error(`[build-redirect-inventory] ES : ${pages.length} page(s) WP publiée(s) (référence, non générées en lignes).`);

  const items = await restCatalogueItems("es");
  for (const item of items) {
    rows.push(row("editionssociales.fr", `/catalogue/${item.slug}`, STATUS_R, `/catalogue/editions-sociales/${item.slug}`));
  }
  for (const slug of auteurs) {
    rows.push(row("editionssociales.fr", `/auteur/${slug}`, STATUS_R, `/catalogue/editions-sociales?author=${slug}`));
  }
  for (const slug of collections) {
    rows.push(row("editionssociales.fr", `/collection/${slug}`, STATUS_R, `/catalogue/editions-sociales?collection=${slug}`));
  }
  // `parution` : une seule destination possible (`upcoming=1`), quel que soit le slug du terme.
  rows.push(row("editionssociales.fr", "/parution/a-paraitre", STATUS_R, "/catalogue/editions-sociales?upcoming=1"));

  // Pages orphelines nommées (E4 #6, #7, #8, #9, #10) — défauts Q2 du plan.
  rows.push(row("editionssociales.fr", "/catalogue-collection", STATUS_R, "/catalogue/editions-sociales"));
  rows.push(row("editionssociales.fr", "/catalogue-auteur", STATUS_R, "/catalogue/editions-sociales"));
  rows.push(row("editionssociales.fr", "/les-emissions-sociales", STATUS_R, "/a-propos"));
  rows.push(row("editionssociales.fr", "/la-geme", STATUS_R, "https://gememarxengels.org"));
  rows.push(row("editionssociales.fr", "/newsletter", STATUS_T, "/"));
  rows.push(row("editionssociales.fr", "/marx-passe-lagreg", STATUS_R, "/catalogue/editions-sociales"));

  // Flux RSS (E4 #11) : 3 lignes séparées, jamais `/feed{/:rest*}`.
  rows.push(row("editionssociales.fr", "/feed", STATUS_R, "/"));
  rows.push(row("editionssociales.fr", "/feed/rss2", STATUS_R, "/"));
  rows.push(row("editionssociales.fr", "/comments/feed", STATUS_R, "/"));

  // Médias partagés (E4 #12) : échantillon de PDF/couvertures réels.
  for (const mediaPath of sampleMediaPaths(items)) {
    rows.push(row("editionssociales.fr", mediaPath, STATUS_R, `https://cms-es.editionssociales.fr${mediaPath}`));
  }

  // wp-admin/wp-login/wp-json (E4 #13, #14) : 302 pour toujours.
  rows.push(row("editionssociales.fr", "/wp-admin/", STATUS_T, "https://cms-es.editionssociales.fr/wp-admin/"));
  rows.push(row("editionssociales.fr", "/wp-login.php", STATUS_T, "https://cms-es.editionssociales.fr/wp-login.php"));
  rows.push(
    row(
      "editionssociales.fr",
      "/wp-json/wp/v2/catalogue",
      STATUS_T,
      "https://cms-es.editionssociales.fr/wp-json/wp/v2/catalogue",
    ),
  );

  return rows;
}

async function buildLdRows() {
  const rows = [];

  const conn = await connectTo(DB_BY_SITE.ld);
  let auteurs, collections;
  try {
    const prefix = await discoverPrefix(conn);
    auteurs = await termsWithCount(conn, prefix, "auteur");
    collections = await termsWithCount(conn, prefix, "collection");
  } finally {
    await conn.end();
  }

  const items = await restCatalogueItems("ld");
  const base = "https://editionssociales.fr/catalogue/la-dispute";
  for (const item of items) {
    rows.push(row("ladispute.fr", `/catalogue/${item.slug}`, STATUS_R, `${base}/${item.slug}`));
  }
  rows.push(row("ladispute.fr", "/catalogue", STATUS_R, base));
  for (const slug of auteurs) {
    rows.push(row("ladispute.fr", `/auteur/${slug}`, STATUS_R, `${base}?author=${slug}`));
  }
  for (const slug of collections) {
    rows.push(row("ladispute.fr", `/collection/${slug}`, STATUS_R, `${base}?collection=${slug}`));
  }
  // Terme `parution` LD : `a-paraitre` (count=1, vérifié dans le plan).
  rows.push(row("ladispute.fr", "/parution/a-paraitre", STATUS_R, `${base}?upcoming=1`));

  rows.push(row("ladispute.fr", "/a-propos", STATUS_R, "https://editionssociales.fr/editions/la-dispute"));
  rows.push(row("ladispute.fr", "/rencontres", STATUS_R, "https://editionssociales.fr/rencontres"));
  rows.push(row("ladispute.fr", "/catalogue-auteurs", STATUS_R, base));
  rows.push(row("ladispute.fr", "/catalogue-collection", STATUS_R, base));

  for (const mediaPath of sampleMediaPaths(items)) {
    rows.push(row("ladispute.fr", mediaPath, STATUS_R, `https://cms-ld.editionssociales.fr${mediaPath}`));
  }

  rows.push(row("ladispute.fr", "/wp-admin/", STATUS_T, "https://cms-ld.editionssociales.fr/wp-admin/"));
  rows.push(row("ladispute.fr", "/wp-login.php", STATUS_T, "https://cms-ld.editionssociales.fr/wp-login.php"));
  rows.push(
    row("ladispute.fr", "/wp-json/wp/v2/catalogue", STATUS_T, "https://cms-ld.editionssociales.fr/wp-json/wp/v2/catalogue"),
  );

  // Catch-all final (E4 #12 côté LD) : quelques échantillons hors de tout autre motif.
  rows.push(row("ladispute.fr", "/", STATUS_R, "https://editionssociales.fr/"));
  rows.push(row("ladispute.fr", "/article-0", STATUS_R, "https://editionssociales.fr/"));
  rows.push(row("ladispute.fr", "/feed", STATUS_R, "https://editionssociales.fr/"));

  return rows;
}

async function main() {
  const header = "host,path,expected_status,expected_location";
  const [esRows, ldRows] = await Promise.all([buildEsRows(), buildLdRows()]);
  const csv = [header, ...esRows, ...ldRows].join("\n") + "\n";
  await writeFile(OUT_FILE, csv, "utf8");
  console.error(
    `[build-redirect-inventory] ${esRows.length + ldRows.length} ligne(s) écrite(s) dans ${OUT_FILE} ` +
      `(REDIRECTS_PERMANENT=${REDIRECTS_PERMANENT ? "1" : "0"} → règles "r" en ${STATUS_R}).`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
