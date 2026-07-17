/**
 * Génère `src/lib/redirects-produits.json` — la table de redirections
 * `/produit/<slug>` du host `boutique.editionssociales.fr`
 * (`plan/02-mise-en-production.md` §Table de redirections, `plan/07-cloture.md`
 * étape 4, P7).
 *
 * `pnpm payload run scripts/build-product-redirects.ts -- [--dry-run] [--help]`
 *
 * Même source de vérité que `migrate-products.ts` (`matchProducts`,
 * `ARBITRAGES`, `migrate-products-core.ts`) : lit les fiches `books` par la
 * Local API Payload et les produits par la Store API live (`WC_STORE_URL`),
 * apparie, puis condense le résultat via `buildProductRedirectTable` (pure,
 * testée) en `src/lib/redirects-produits.json`.
 *
 * ⚠️ Artefact **versionné** dans le repo (contrairement à
 * `scripts/redirect-inventory.csv`, régénéré à chaque étape et jamais commité) :
 * décision d'arbitrage du plan — une seule table, générée une fois, réutilisée
 * telle quelle au Jour J (302, `REDIRECTS_PERMANENT=0`) puis à la clôture (301,
 * `REDIRECTS_PERMANENT=1`) sans être recalculée entre les deux. Ne relancer ce
 * script que pour rafraîchir la table elle-même (nouvel arbitrage, nouveau
 * produit boutique) — jamais comme partie du build/déploiement.
 *
 * N'écrit rien dans Payload (contrairement à `migrate-products.ts`) : lecture
 * seule des deux sources, un seul fichier JSON produit en sortie.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { getPayload, type Payload } from "payload";
import config from "../src/payload.config.ts";

import type { WcProduct } from "../src/lib/catalogue-source.ts";
import { fetchAllPages } from "../src/lib/fetch-all-pages.ts";
import type { Book } from "../src/payload-types.ts";

import { createLogger, fetchWithRetry, type Logger } from "./migrate-catalogue/utils.ts";
import {
  ARBITRAGES,
  buildProductRedirectTable,
  matchProducts,
  type BookRef,
  type ProductRedirectTable,
} from "./migrate-products-core.ts";

const OUT_FILE = path.join(process.cwd(), "src/lib/redirects-produits.json");

/* ─────────────────────────── CLI ─────────────────────────── */

const HELP = `Usage : pnpm payload run scripts/build-product-redirects.ts -- [options]

Génère src/lib/redirects-produits.json (table de redirections /produit/<slug>
du host boutique.editionssociales.fr, plan/02-mise-en-production.md).

Options :
  --dry-run    N'écrit rien — calcule et rapporte les mêmes comptages.
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

/* ─────────────────────────── Store API (transport local, cf. migrate-products.ts) ─────────────────────────── */

async function fetchStoreProducts(): Promise<WcProduct[]> {
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
      if (!Array.isArray(items)) throw new Error("réponse non-liste");
      return items;
    },
    onPageError: (err, page) => {
      throw new Error(
        `[build-product-redirects] Store API indisponible (page ${page}) : ${err instanceof Error ? err.message : err}`,
      );
    },
  });
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
    boutiqueUrl: doc.buy?.boutiqueUrl ?? null,
    published: doc._status === "published",
  };
}

/* ─────────────────────────── Rapport ─────────────────────────── */

function report(
  logger: Logger,
  input: {
    productsTotal: number;
    booksTotal: number;
    table: ProductRedirectTable;
    matchedTotal: number;
    orphansTotal: number;
    pendingArbitrage: number;
    invalidResolutions: number;
    unexpectedDuplicates: number;
  },
): void {
  const entriesTotal = Object.keys(input.table).length;
  logger.info(
    `[build-product-redirects] ${input.productsTotal} produit(s) Store API, ${input.booksTotal} fiche(s) Payload — ` +
      `${input.matchedTotal} apparié(s), ${input.orphansTotal} orphelin(s) → ${entriesTotal} entrée(s) dans la table.`,
  );
  if (input.pendingArbitrage > 0 || input.invalidResolutions > 0 || input.unexpectedDuplicates > 0) {
    logger.warn(
      `[build-product-redirects] ⚠️ table d'arbitrage non soldée (attendu 0 partout au 12/07, plan §Migration produits) : ` +
        `${input.pendingArbitrage} en attente, ${input.invalidResolutions} résolution(s) invalide(s), ` +
        `${input.unexpectedDuplicates} conflit(s) — ces fiches/produits n'ont AUCUNE entrée dans la table (défaut ` +
        `conservateur, cf. migrate-products-core.ts) ; les URLs /produit/ correspondantes tomberont sur le repli ` +
        `/catalogue de next.config.ts tant que ce n'est pas tranché.`,
    );
  }
}

/* ─────────────────────────── main ─────────────────────────── */

async function main(): Promise<void> {
  const opts = parseCliOptions(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const logger = createLogger();
  logger.info(`[build-product-redirects] démarrage — dry-run=${opts.dryRun}`);

  const products = await fetchStoreProducts();

  const payload = await getPayload({ config });
  try {
    const bookDocs = await fetchBooks(payload);
    const bookRefs = bookDocs.map(toBookRef);

    const match = matchProducts(bookRefs, products, ARBITRAGES);
    const table = buildProductRedirectTable(match, ARBITRAGES);

    report(logger, {
      productsTotal: products.length,
      booksTotal: bookDocs.length,
      table,
      matchedTotal: match.matched.length,
      orphansTotal: match.orphans.length,
      pendingArbitrage: match.pendingArbitrage.length,
      invalidResolutions: match.invalidResolutions.length,
      unexpectedDuplicates: match.unexpectedDuplicates.length,
    });

    if (!opts.dryRun) {
      const payloadOut = {
        // Métadonnées de traçabilité — jamais lues par next.config.ts (seul
        // `entries` compte), utiles en revue de PR / audit.
        generatedAt: new Date().toISOString(),
        source: "scripts/build-product-redirects.ts (Local API Payload + Store API live)",
        productsTotal: products.length,
        matchedTotal: match.matched.length,
        orphansTotal: match.orphans.length,
        entries: table,
      };
      await mkdir(path.dirname(OUT_FILE), { recursive: true });
      await writeFile(OUT_FILE, JSON.stringify(payloadOut, null, 2) + "\n", "utf8");
      logger.info(`[build-product-redirects] table écrite : ${OUT_FILE}`);
    } else {
      logger.info("[build-product-redirects] --dry-run : rien écrit.");
    }
  } finally {
    await payload.destroy();
  }
}

// Top-level await obligatoire : `payload run` fait `process.exit(0)` dès que
// l'import du module est résolu (contrat du dépôt, cf. `migrate-catalogue/index.ts`).
try {
  await main();
  process.exit(0);
} catch (err) {
  console.error("[build-product-redirects] ÉCHEC —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
}
