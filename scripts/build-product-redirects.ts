/**
 * Régénère `src/lib/redirects-produits.json` — la table de redirections
 * `/produit/<slug>` des hosts boutique legacy (`next.config.ts`).
 *
 * `pnpm build:product-redirects` (ou
 * `pnpm payload run scripts/build-product-redirects.ts -- [--dry-run] [--help]`)
 *
 * Successeur post-coupure OVH du script du même nom supprimé par `aef3282` :
 * la Store API live a disparu, l'inventaire des slugs produit est GELÉ
 * (`scripts/produits-boutique-legacy.json`) — la seule source vivante est la
 * base Payload (Local API, `DATABASE_URL` + `PAYLOAD_SECRET` requis, URL
 * poolée : lecture seule d'app, pas une migration). Régénérer ne sert donc
 * qu'à rafraîchir les DESTINATIONS (slug/édition courants des fiches) et à
 * faire tomber les clés dont la fiche a disparu — jamais à découvrir de
 * nouvelles URLs legacy.
 *
 * ⚠️ Artefact **versionné** : le rapport imprimé (disparus / ajoutés /
 * reciblés, écarts vs table précédente) est fait pour être collé en
 * description de PR — chaque clé perdue retombe sur le repli `/catalogue`,
 * c'est un choix à faire relire, pas un détail.
 *
 * N'écrit rien dans Payload : lecture seule, un seul fichier JSON en sortie.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { getPayload, type Payload } from "payload";
import config from "../src/payload.config.ts";

import type { Book } from "../src/payload-types.ts";

import {
  ARBITRAGES,
  buildProductRedirectTable,
  diffTables,
  matchProducts,
  type BookRef,
  type ProductRedirectTable,
  type TableDiff,
} from "./build-product-redirects-core.ts";

const OUT_FILE = path.join(process.cwd(), "src/lib/redirects-produits.json");
const INVENTORY_FILE = path.join(process.cwd(), "scripts/produits-boutique-legacy.json");

/* ─────────────────────────── CLI ─────────────────────────── */

const HELP = `Usage : pnpm payload run scripts/build-product-redirects.ts -- [options]

Régénère src/lib/redirects-produits.json (table de redirections /produit/<slug>
des hosts boutique legacy, next.config.ts) depuis la base Payload et
l'inventaire gelé scripts/produits-boutique-legacy.json.

Options :
  --dry-run    N'écrit rien — calcule et rapporte les mêmes écarts.
  --help, -h   Affiche cette aide et quitte (aucune I/O réseau).
`;

interface CliOptions {
  dryRun: boolean;
  help: boolean;
}

function parseCliOptions(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });
  return { dryRun: values["dry-run"] === true, help: values.help === true };
}

/* ─────────────────────────── Entrées fichiers ─────────────────────────── */

async function readInventory(): Promise<string[]> {
  const parsed: unknown = JSON.parse(await readFile(INVENTORY_FILE, "utf8"));
  const slugs = (parsed as { slugs?: unknown }).slugs;
  if (!Array.isArray(slugs) || !slugs.every((s) => typeof s === "string") || slugs.length === 0) {
    throw new Error(`[build-product-redirects] inventaire gelé illisible : ${INVENTORY_FILE}`);
  }
  return slugs;
}

async function readPreviousTable(): Promise<ProductRedirectTable> {
  const parsed: unknown = JSON.parse(await readFile(OUT_FILE, "utf8"));
  const entries = (parsed as { entries?: unknown }).entries;
  if (entries == null || typeof entries !== "object") {
    throw new Error(`[build-product-redirects] table précédente illisible : ${OUT_FILE}`);
  }
  return entries as ProductRedirectTable;
}

/* ─────────────────────────── Payload (lecture des fiches) ─────────────────────────── */

async function fetchBooks(payload: Payload): Promise<Book[]> {
  const { docs } = await payload.find({
    collection: "books",
    limit: 0,
    depth: 0,
    draft: true,
    sort: "id",
  });
  return docs;
}

function toBookRef(doc: Book): BookRef {
  return {
    id: doc.id,
    slug: doc.slug,
    edition: (doc.edition ?? null) as BookRef["edition"],
    origin: doc.origin,
    boutiqueUrl: doc.buy?.boutiqueUrl ?? null,
  };
}

/* ─────────────────────────── Rapport ─────────────────────────── */

function reportAnomalies(match: ReturnType<typeof matchProducts>): void {
  const warn = (label: string, items: string[]): void => {
    if (items.length === 0) return;
    console.warn(`[build-product-redirects] ⚠️ ${label} (${items.length}) :`);
    for (const item of items) console.warn(`  - ${item}`);
  };
  warn(
    "arbitrages sans résolution — fiches sans entrée",
    match.pendingArbitrage.map((a) => `${a.bookSlug} (lien mort : ${a.brokenSlug})`),
  );
  warn(
    "résolutions d'arbitrage hors inventaire — fiches sans entrée",
    match.invalidResolutions.map((a) => `${a.bookSlug} → ${a.resolution ?? "?"}`),
  );
  warn(
    "clés disputées sans arbitrage — aucune entrée (défaut conservateur)",
    match.unexpectedDuplicates.map((d) => `${d.productSlug} ← ${d.bookSlugs.join(", ")}`),
  );
  warn(
    "liens buy.boutiqueUrl hors inventaire — URL jamais servie par la boutique, rapport seul",
    match.linksOutsideInventory.map((l) => `${l.bookSlug} → /produit/${l.productSlug}`),
  );
  warn(
    "fiches boutique hors inventaire — créées après la coupure, rien à rediriger",
    match.boutiqueOutsideInventory,
  );
}

function reportDiff(diff: TableDiff): void {
  const dest = (t: { edition: string | null; slug: string }): string =>
    t.edition != null ? `/catalogue/${t.edition}/${t.slug}` : `/boutique/${t.slug}`;
  if (diff.removed.length > 0) {
    console.warn(`[build-product-redirects] clés DISPARUES vs table précédente (${diff.removed.length}) — repli /catalogue :`);
    for (const { key, before } of diff.removed) console.warn(`  - ${key} (visait ${dest(before)})`);
  }
  if (diff.added.length > 0) {
    console.warn(`[build-product-redirects] clés AJOUTÉES vs table précédente (${diff.added.length}) :`);
    for (const { key, after } of diff.added) console.warn(`  + ${key} → ${dest(after)}`);
  }
  if (diff.retargeted.length > 0) {
    console.warn(`[build-product-redirects] clés RECIBLÉES (${diff.retargeted.length}) :`);
    for (const { key, before, after } of diff.retargeted)
      console.warn(`  ~ ${key} : ${dest(before)} → ${dest(after)}`);
  }
  if (diff.removed.length + diff.added.length + diff.retargeted.length === 0) {
    console.log("[build-product-redirects] aucun écart d'entrées avec la table précédente.");
  }
}

/* ─────────────────────────── main ─────────────────────────── */

async function main(): Promise<void> {
  const opts = parseCliOptions(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  console.log(`[build-product-redirects] démarrage — dry-run=${opts.dryRun}`);

  const inventory = await readInventory();
  const previous = await readPreviousTable();

  const payload = await getPayload({ config });
  try {
    const bookDocs = await fetchBooks(payload);
    const bookRefs = bookDocs.map(toBookRef);

    const match = matchProducts(bookRefs, inventory, ARBITRAGES);
    const table = buildProductRedirectTable(match, ARBITRAGES);
    const diff = diffTables(previous, table);

    console.log(
      `[build-product-redirects] ${inventory.length} slug(s) d'inventaire gelé, ${bookRefs.length} fiche(s) Payload — ` +
        `${match.matched.length} apparié(s), ${match.orphans.length} orphelin(s) avec fiche boutique → ` +
        `${Object.keys(table).length} entrée(s) (table précédente : ${Object.keys(previous).length}).`,
    );
    reportAnomalies(match);
    reportDiff(diff);

    if (!opts.dryRun) {
      const payloadOut = {
        // Métadonnées de traçabilité — jamais lues par next.config.ts (seul
        // `entries` compte), utiles en revue de PR / audit.
        generatedAt: new Date().toISOString(),
        source:
          "scripts/build-product-redirects.ts (Local API Payload + inventaire gelé scripts/produits-boutique-legacy.json — la Store API a disparu avec la coupure OVH)",
        inventoryTotal: inventory.length,
        matchedTotal: match.matched.length,
        orphansTotal: match.orphans.length,
        entries: table,
      };
      await writeFile(OUT_FILE, JSON.stringify(payloadOut, null, 2) + "\n", "utf8");
      console.log(`[build-product-redirects] table écrite : ${OUT_FILE}`);
    } else {
      console.log("[build-product-redirects] --dry-run : rien écrit.");
    }
  } finally {
    await payload.destroy();
  }
}

// Top-level await obligatoire : `payload run` fait `process.exit(0)` dès que
// l'import du module est résolu (contrat du dépôt, cf. `scripts/seed-users.ts`).
try {
  await main();
  process.exit(0);
} catch (err) {
  console.error("[build-product-redirects] ÉCHEC —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
}
