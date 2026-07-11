/**
 * Migration catalogue WordPress → Payload/Postgres — orchestrateur.
 *
 * `pnpm payload run scripts/migrate-catalogue/index.ts -- --site=all [--dry-run]`
 *
 * Pipeline (dans l'ordre, jamais réordonné) :
 *   health-check → fetch → oracle SQL → médias → réécriture HTML → import → balayage des suppressions → rapport.
 *
 * Échecs bruyants : toute exception non rattrapée termine le process avec le
 * code 1 (cf. `main().catch(...)` en bas de fichier) — pas de dégradation
 * silencieuse ici, contrairement à l'adaptateur http de prod qui doit rester
 * résilient pour le front (`src/lib/catalogue-http.ts`).
 *
 * Note de dépendance : `@payload-config` suppose l'alias tsconfig posé par le
 * scaffold Payload (E1/E2 de `plan/03-catalogue.md`), en cours d'écriture en
 * parallèle dans ce même worktree — ce fichier ne peut pas typechecker/exécuter
 * tant que ce scaffold n'existe pas. C'est attendu (mission A3 : écrire le
 * script, pas le faire tourner avant que E1/E2 aient posé le socle).
 */
import { getPayload } from "payload";
import config from "../../src/payload.config.ts";

import { fetchAParaitreIds, fetchCatalogue, healthCheck, SITE_BASES, type WpBookField, type WpCatalogueRaw } from "./fetch-wp.ts";
import { type BookImportContext, sweepMissing, upsertAuthors, upsertBooks, upsertCollections } from "./import.ts";
import { type BookMediaInput, resolveMediaForBooks } from "./media.ts";
import { rewriteHtmlUrls } from "./rewrite-html.ts";
import { writeReport } from "./report.ts";
import { runOracle } from "./sql-oracle.ts";
import { createLogger, decodeEntities, parseCliArgs, sitesFor, type Site } from "./utils.ts";

const OUT_DIR = "scripts/migrate-catalogue/out";

function coverUrlOf(book?: WpBookField): string | null {
  const cover = book?.cover;
  if (cover == null) return null;
  if (typeof cover === "string") return cover.trim() || null;
  return cover.url || null;
}

interface EnrichedItem {
  site: Site;
  item: WpCatalogueRaw;
  aParaitre: boolean;
  contentHtml: string;
  /** `book.plus_loin`, patché par l'oracle SQL si besoin (ES). */
  plusLoinRaw: string | null;
  coverUrl: string | null;
  tableUrl: string | null;
  extraitUrl: string | null;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const cli = parseCliArgs(process.argv.slice(2));
  const sites = sitesFor(cli.site);
  const logger = createLogger();

  logger.info(
    `[migrate-catalogue] démarrage — sites=${sites.join(",")} dry-run=${cli.dryRun}`,
  );

  /* 1) Health-check — bruyant, en tête (E9). */
  for (const site of sites) {
    await healthCheck(site);
    logger.info(`[migrate-catalogue] health-check ${site} OK.`);
  }

  /* 2) Fetch REST (pagination complète + flag « à paraître »). */
  const itemsBySite = {} as Record<Site, WpCatalogueRaw[]>;
  const aParaitreBySite = {} as Record<Site, Set<number>>;
  for (const site of sites) {
    itemsBySite[site] = await fetchCatalogue(site, logger);
    aParaitreBySite[site] = await fetchAParaitreIds(site, logger);
  }
  const captured = Object.fromEntries(sites.map((s) => [s, itemsBySite[s].length])) as Record<Site, number>;

  /* 3) Payload — instance unique pour tout le run (find/create/update). */
  const payload = await getPayload({ config });

  try {
    /* 4) Oracle SQL (piège plus_loin ES, comptages, liens boutique, descriptions de termes). */
    const oracle = await runOracle(sites, itemsBySite, logger);
    const plusLoinPatchMap = new Map(oracle.plusLoinPatches.map((p) => [`${p.site}:${p.wpId}`, p.value]));

    /* Items enrichis (patch plus_loin appliqué) — base commune médias + import. */
    const enriched: EnrichedItem[] = [];
    for (const site of sites) {
      for (const item of itemsBySite[site]) {
        const patched = plusLoinPatchMap.get(`${site}:${item.id}`);
        enriched.push({
          site,
          item,
          aParaitre: aParaitreBySite[site].has(item.id),
          contentHtml: item.content?.rendered ?? "",
          plusLoinRaw: patched ?? item.book?.plus_loin ?? null,
          coverUrl: coverUrlOf(item.book),
          tableUrl: item.book?.table ?? null,
          extraitUrl: item.book?.extrait ?? null,
        });
      }
    }

    /* 5) Médias : rapatriement + dédup (avant réécriture HTML). */
    const mediaInputs: BookMediaInput[] = enriched.map((e) => ({
      site: e.site,
      wpId: e.item.id,
      title: decodeEntities(e.item.title.rendered),
      coverUrl: e.coverUrl,
      tableUrl: e.tableUrl,
      extraitUrl: e.extraitUrl,
      contentHtml: e.contentHtml,
      plusLoinHtml: e.plusLoinRaw,
    }));
    const { resolutions, failures: mediaFailures } = await resolveMediaForBooks(
      payload,
      mediaInputs,
      SITE_BASES,
      logger,
      cli.dryRun,
    );

    /* 6) Réécriture HTML (sourceUrl → url Payload) — AVANT conversion Lexical. */
    const contexts: BookImportContext[] = enriched.map((e) => {
      const media = resolutions.get(`${e.site}:${e.item.id}`)!;
      const rewrittenContentHtml = rewriteHtmlUrls(e.contentHtml, media.embeddedUrlMap) ?? "";
      const rewrittenPlusLoinHtml = e.plusLoinRaw
        ? rewriteHtmlUrls(e.plusLoinRaw, media.embeddedUrlMap)
        : null;
      return {
        site: e.site,
        item: e.item,
        aParaitre: e.aParaitre,
        media,
        rewrittenContentHtml,
        rewrittenPlusLoinHtml,
      };
    });

    /* 7) Import : authors → collections → books (upsert, idempotent). */
    const authors = await upsertAuthors(payload, sites, itemsBySite, logger, cli.dryRun);
    const collections = await upsertCollections(payload, sites, itemsBySite, logger, cli.dryRun);
    const books = await upsertBooks(payload, contexts, authors.bySlug, collections.byKey, logger, cli.dryRun);

    /* 8) Balayage des suppressions (jamais de delete). */
    const sweep = await sweepMissing(payload, sites, books.capturedKeys, logger, cli.dryRun);

    /* 9) Rapport. */
    const { mdPath, jsonPath } = await writeReport(
      {
        startedAt,
        sites,
        dryRun: cli.dryRun,
        captured,
        oracle,
        authors,
        collections,
        books,
        sweep,
        mediaFailures,
      },
      OUT_DIR,
    );
    logger.info(`[migrate-catalogue] rapport écrit : ${mdPath} / ${jsonPath}`);
    logger.info(
      `[migrate-catalogue] terminé en ${((Date.now() - startedAt) / 1000).toFixed(1)}s — ` +
        `books: ${books.created} créé(s)/${books.updated} maj/${books.unchanged} inchangé(s), ` +
        `contentTouched=true: ${books.contentTouchedKeys.length} (attendu 0).`,
    );
    if (books.failed.length > 0) {
      throw new Error(
        `${books.failed.length} fiche(s) en échec d'import (détail dans le rapport) : ` +
          books.failed.map((f) => `${f.site}#${f.wpId} ${f.slug}`).join(", "),
      );
    }
  } finally {
    await payload.destroy();
  }
}

// Top-level await obligatoire : `payload run` fait `process.exit(0)` dès que
// l'import du module est résolu — un `main()` fire-and-forget serait tué avant
// d'avoir travaillé.
try {
  await main();
  process.exit(0);
} catch (err) {
  console.error("[migrate-catalogue] ÉCHEC —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
}
