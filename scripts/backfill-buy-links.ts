/**
 * Backfill des liens libraires (`buy.parislibrairies`/`buy.lalibrairie`) sur
 * la base existante — pendant, pour le passé, du hook `autofillBuyLinks`
 * (`src/payload/collections/Books.ts`) qui couvre désormais les sauvegardes
 * futures. Corrige aussi les inversions/liens legacy laissés par l'ancienne
 * saisie manuelle (`listeliv.php`, fiche de l'autre libraire dans le mauvais
 * champ) — jamais par id codé en dur, uniquement par classification
 * (`planBackfillForBook`, `src/payload/lib/buy-links-core.ts`).
 *
 * Usage :
 *   pnpm backfill:buy-links                 (dry-run — rien n'est écrit)
 *   pnpm payload run scripts/backfill-buy-links.ts -- --apply   (écrit)
 *
 * ⚠️ JAMAIS lancé automatiquement (mission) — script écrit, pas exécuté ici.
 *
 * Réseau : une session LaLibrairie partagée pour tout le run (recréée
 * seulement si une résolution échoue — cookies/jeton à durée de vie limitée),
 * résolutions séquentielles livre par livre (jamais deux livres en vol en
 * même temps), ~250 ms de pause entre deux livres qui ont déclenché du
 * réseau (aucune pause pour un livre traité sans réseau — swap, `autre`,
 * déjà correct).
 */
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import { getPayload, type Payload } from "payload";
import config from "../src/payload.config.ts";

import type { Book } from "../src/payload-types.ts";

import { revalidateCatalogueNow } from "../src/payload/hooks/revalidate.ts";
import { planBackfillForBook, type BuyLinksBackfillPlan } from "../src/payload/lib/buy-links-core.ts";
import {
  createLalibrairieSession,
  resolveLalibrairieUrl,
  resolveParisLibrairiesUrl,
  type LalibrairieSession,
} from "../src/payload/lib/buy-links-resolve.ts";

const PAUSE_MS = 250;
const FIELDS = ["parislibrairies", "lalibrairie"] as const;
type BuyField = (typeof FIELDS)[number];

/* ─────────────────────────── CLI ─────────────────────────── */

const HELP = `Usage : pnpm payload run scripts/backfill-buy-links.ts -- [options]

Remplit/corrige buy.parislibrairies et buy.lalibrairie pour toutes les fiches
livres existantes, depuis l'ISBN — par classification (jamais un id codé en
dur), même logique que le hook autofillBuyLinks (Books.ts) qui couvre les
sauvegardes futures.

Options :
  --apply      Écrit les changements (défaut : dry-run, rien n'est écrit).
  --help, -h   Affiche cette aide et quitte (aucune I/O réseau).
`;

interface CliOptions {
  apply: boolean;
  help: boolean;
}

function parseCliOptions(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      apply: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });
  return { apply: values.apply === true, help: values.help === true };
}

/* ─────────────────────────── Lecture Payload ─────────────────────────── */

interface BookRow {
  id: number;
  slug: string;
  title: string;
  edition: string | null;
  origin: Book["origin"];
  isbn: string | null;
  boutiqueUrl: string | null;
  parislibrairies: string | null;
  lalibrairie: string | null;
}

function toBookRow(doc: Book): BookRow {
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    edition: doc.edition ?? null,
    origin: doc.origin,
    isbn: doc.isbn ?? null,
    boutiqueUrl: doc.buy?.boutiqueUrl ?? null,
    parislibrairies: doc.buy?.parislibrairies ?? null,
    lalibrairie: doc.buy?.lalibrairie ?? null,
  };
}

/** Chemin de fiche publique — même règle que `stock-import.ts`/`revalidate.ts` (édition → catalogue, sinon boutique). */
function fichePath(book: BookRow): string | null {
  if (typeof book.edition === "string") return `/catalogue/${book.edition}/${book.slug}`;
  if (book.origin === "boutique") return `/boutique/${book.slug}`;
  return null;
}

/* ─────────────────────────── Résolution réseau ─────────────────────────── */

/**
 * Résout UN champ pour un livre — session LaLibrairie du run réutilisée
 * (créée à la demande), une seule reprise avec session fraîche si la
 * première tentative échoue (session/jeton expirés en cours de run).
 */
async function resolveField(
  field: BuyField,
  ean13: string,
  sessionRef: { current: LalibrairieSession | null },
): Promise<string | null> {
  if (field === "parislibrairies") {
    return resolveParisLibrairiesUrl(ean13);
  }
  if (!sessionRef.current) {
    sessionRef.current = await createLalibrairieSession();
  }
  if (sessionRef.current) {
    const result = await resolveLalibrairieUrl(sessionRef.current, ean13);
    if (result != null) return result;
  }
  sessionRef.current = await createLalibrairieSession();
  if (!sessionRef.current) return null;
  return resolveLalibrairieUrl(sessionRef.current, ean13);
}

/* ─────────────────────────── Rapport ─────────────────────────── */

interface FieldChange {
  bookId: number;
  slug: string;
  field: BuyField;
  before: string | null;
  after: string;
}

interface FieldAnomaly {
  bookId: number;
  slug: string;
  field: BuyField;
  value: string;
}

interface NotFoundEntry {
  bookId: number;
  slug: string;
  field: BuyField;
}

interface InvalidIsbnEntry {
  bookId: number;
  slug: string;
  isbn: string | null;
}

interface RunReport {
  changes: FieldChange[];
  filled: number;
  corrected: number;
  notFound: NotFoundEntry[];
  invalidIsbn: InvalidIsbnEntry[];
  intact: number;
  anomalies: FieldAnomaly[];
}

function emptyReport(): RunReport {
  return { changes: [], filled: 0, corrected: 0, notFound: [], invalidIsbn: [], intact: 0, anomalies: [] };
}

interface PendingWrite {
  book: BookRow;
  buy: { boutiqueUrl: string | null; parislibrairies: string | null; lalibrairie: string | null };
}

/**
 * Traite un livre : décision pure (`planBackfillForBook`), puis résolution
 * réseau des seuls champs `resolve` du plan. Renvoie l'écriture à appliquer
 * (`null` si rien n'a changé) et signale si le run a tapé le réseau pour ce
 * livre (pour la pause entre livres, à la charge de l'appelant).
 */
async function processBook(
  book: BookRow,
  plan: BuyLinksBackfillPlan,
  report: RunReport,
  sessionRef: { current: LalibrairieSession | null },
): Promise<{ write: PendingWrite | null; usedNetwork: boolean }> {
  const nextValues: Partial<Record<BuyField, string>> = {};
  let usedNetwork = false;

  for (const field of FIELDS) {
    const fieldPlan = plan[field];

    if (fieldPlan.action.kind === "swap") {
      nextValues[field] = fieldPlan.action.value;
      report.corrected += 1;
      report.changes.push({ bookId: book.id, slug: book.slug, field, before: book[field], after: fieldPlan.action.value });
      continue;
    }

    if (fieldPlan.action.kind === "resolve" && plan.ean13) {
      usedNetwork = true;
      const resolved = await resolveField(field, plan.ean13, sessionRef);
      if (resolved) {
        nextValues[field] = resolved;
        if (fieldPlan.classification === "empty") report.filled += 1;
        else report.corrected += 1;
        report.changes.push({ bookId: book.id, slug: book.slug, field, before: book[field], after: resolved });
      } else {
        report.notFound.push({ bookId: book.id, slug: book.slug, field });
      }
      continue;
    }

    if (fieldPlan.classification === "autre") {
      report.anomalies.push({ bookId: book.id, slug: book.slug, field, value: book[field] as string });
    }
  }

  if (plan.ean13 == null) {
    report.invalidIsbn.push({ bookId: book.id, slug: book.slug, isbn: book.isbn });
  } else if (Object.keys(nextValues).length === 0) {
    report.intact += 1;
  }

  if (Object.keys(nextValues).length === 0) {
    return { write: null, usedNetwork };
  }

  return {
    write: {
      book,
      // Groupe `buy` écrit EN ENTIER (valeurs existantes + seuls les champs
      // du plan écrasés) — même garde-fou que `stock-import.ts` pour
      // `commerce` : on ne s'appuie jamais sur la fusion partielle de
      // Payload pour un champ groupe. `boutiqueUrl` n'est JAMAIS dans
      // `nextValues` : toujours repris tel quel.
      buy: {
        boutiqueUrl: book.boutiqueUrl,
        parislibrairies: nextValues.parislibrairies ?? book.parislibrairies,
        lalibrairie: nextValues.lalibrairie ?? book.lalibrairie,
      },
    },
    usedNetwork,
  };
}

/* ─────────────────────────── Affichage ─────────────────────────── */

function printReport(report: RunReport, writesCount: number, totalBooks: number, apply: boolean): void {
  console.log(`[backfill-buy-links] mode=${apply ? "apply" : "dry-run"} — ${totalBooks} fiche(s) lue(s).`);

  if (report.changes.length > 0) {
    console.log(`\n[backfill-buy-links] changements (${report.changes.length}) — id|slug|champ|avant→après :`);
    for (const c of report.changes) {
      console.log(`  ${c.bookId}|${c.slug}|${c.field}|${c.before ?? "(vide)"} → ${c.after}`);
    }
  }

  console.log(
    `\n[backfill-buy-links] compteurs — remplis: ${report.filled}, corrigés: ${report.corrected}, ` +
      `introuvables sur la plateforme: ${report.notFound.length}, isbn invalide/absent: ${report.invalidIsbn.length}, ` +
      `intacts: ${report.intact} (${writesCount} fiche(s) ${apply ? "écrite(s)" : "à écrire"}).`,
  );

  if (report.notFound.length > 0) {
    console.log(`\n[backfill-buy-links] introuvables sur la plateforme (${report.notFound.length}) :`);
    for (const n of report.notFound) console.log(`  - ${n.bookId}|${n.slug}|${n.field}`);
  }

  if (report.invalidIsbn.length > 0) {
    console.log(`\n[backfill-buy-links] isbn invalide/absent (${report.invalidIsbn.length}) :`);
    for (const i of report.invalidIsbn) console.log(`  - ${i.bookId}|${i.slug}|${i.isbn ?? "(absent)"}`);
  }

  if (report.anomalies.length > 0) {
    console.log(
      `\n[backfill-buy-links] anomalies signalées, JAMAIS touchées (${report.anomalies.length}) :`,
    );
    for (const a of report.anomalies) console.log(`  - ${a.bookId}|${a.slug}|${a.field}|${a.value}`);
  }

  if (!apply && writesCount > 0) {
    console.log("\n[backfill-buy-links] --dry-run : rien écrit — relancer avec --apply pour appliquer.");
  }
}

/* ─────────────────────────── main ─────────────────────────── */

async function main(): Promise<void> {
  const opts = parseCliOptions(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const payload: Payload = await getPayload({ config });
  try {
    const { docs } = await payload.find({
      collection: "books",
      limit: 0,
      depth: 0,
      sort: "id",
      overrideAccess: true,
    });
    const books = docs.map(toBookRow);

    const report = emptyReport();
    const writes: PendingWrite[] = [];
    const sessionRef: { current: LalibrairieSession | null } = { current: null };

    for (const book of books) {
      const plan = planBackfillForBook(book);
      const { write, usedNetwork } = await processBook(book, plan, report, sessionRef);
      if (write) writes.push(write);
      if (usedNetwork) await delay(PAUSE_MS);
    }

    if (opts.apply) {
      for (const write of writes) {
        await payload.update({
          collection: "books",
          id: write.book.id,
          data: { buy: write.buy },
          context: { migration: true, disableRevalidate: true },
          overrideAccess: true,
        });
      }
      revalidateCatalogueNow(
        writes.map((w) => fichePath(w.book)).filter((p): p is string => p != null),
      );
    }

    printReport(report, writes.length, books.length, opts.apply);
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
  console.error("[backfill-buy-links] ÉCHEC —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
}
