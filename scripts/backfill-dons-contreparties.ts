/**
 * Backfill des dons-contreparties encaissés AVANT le déploiement de la
 * feature « contrepartie → commande `orderType: don` » (campagne
 * « souscription-2026 », ouverte le 2026-08-20) — ces dons n'ont ni
 * sélection ni commande. Décision client : les paliers FIXES (composition
 * entièrement déterminée) sont créés directement ; les paliers À CHOIX
 * attendent que Clara recueille les choix par mail, puis une seconde passe
 * (`--choix`) crée leurs commandes. Aucun état « en attente » en base : le
 * transitoire vit dans le CSV d'inventaire (mode 1) et le CSV `--choix`
 * (mode 2), tous deux hors DB.
 *
 * Usage :
 *   pnpm payload run scripts/backfill-dons-contreparties.ts
 *     → MODE 1, inventaire (lecture seule, défaut). Liste les sessions
 *       Stripe payées de la campagne, sort un CSV (stdout +
 *       /tmp/backfill-dons-inventaire.csv) et un récapitulatif.
 *
 *   pnpm payload run scripts/backfill-dons-contreparties.ts -- --choix fichier.csv
 *     → MODE 2, dry-run — résout paliers fixes + paliers à choix couverts
 *       par le fichier, affiche ce qui SERAIT créé, n'écrit rien.
 *
 *   pnpm payload run scripts/backfill-dons-contreparties.ts -- --execute [--choix fichier.csv] [--mail]
 *     → MODE 2, exécution réelle — crée les commandes via
 *       `handleDonationSessionCompleted` (MÊME pipeline idempotent que le
 *       webhook Stripe, `order-handler.ts`) : relancer le script est
 *       TOUJOURS sans double effet. `--mail` renvoie le remerciement
 *       enrichi (par défaut NON — les donateurs ont déjà reçu le
 *       remerciement simple au moment du don).
 *
 * Le cœur pur (classification, parsing `--choix`, mise en forme du CSV
 * d'inventaire) vit dans `backfill-dons-core.ts`, testé indépendamment.
 * Imports RELATIFS uniquement pour TOUT le reste (même contrat que
 * `import-orders-woo.ts`) : ce module va jusqu'à réutiliser
 * `handleDonationSessionCompleted` (`src/app/api/stripe/webhook/
 * order-handler.ts`) — le seul moyen de garantir EXACTEMENT le même
 * comportement que le webhook (idempotence, décrément de stock, marqueurs
 * d'effet, mail).
 *
 * Stripe : `stripe.checkout.sessions.list` (PAS la Search API charges — seule
 * la session porte l'id de session et l'adresse collectée), paginée par
 * itération asynchrone du SDK officiel, filtrée sur `created[gte]` (borne au
 * 2026-08-19, veille de l'ouverture) puis `metadata.campaign`/`metadata.kind`/
 * `payment_status` côté client (Stripe ne filtre pas la metadata côté
 * serveur pour cet endpoint). Aucun `expand` : tous les champs consommés ici
 * (metadata, customer_details, collected_information, amount_total,
 * payment_status) sont déjà présents sur l'objet Session NON développé —
 * mêmes champs que ceux lus tels quels par le webhook depuis l'event brut
 * (`order-handler.ts`), jamais une relation Stripe qui nécessiterait
 * `expand` (line_items, customer objet…).
 */
import { writeFile, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { getPayload } from "payload";
import type Stripe from "stripe";
import config from "../src/payload.config.ts";

import { getStripe, stripeEnabled } from "../src/lib/stripe.ts";
import { CAMPAIGN_KEY, type DonationTierId } from "../src/lib/donation-tiers.ts";
import { getContrepartieBooksBySlugs } from "../src/lib/contreparties.ts";
import type { ContrepartieSelection } from "../src/lib/contreparties-core.ts";
import { encodeCheckoutLines } from "../src/lib/checkout-core.ts";
import { findOrderBySessionId } from "../src/lib/order-source.ts";
import { centsToEuros } from "../src/lib/money.ts";
import { handleDonationSessionCompleted } from "../src/app/api/stripe/webhook/order-handler.ts";

import {
  buildInventoryRow,
  decideDonationAction,
  formatInventoryCsv,
  parseChoixCsv,
  summarizeInventory,
  type InventoryRow,
} from "./backfill-dons-core.ts";

/* ─────────────────────────── CLI ─────────────────────────── */

const HELP = `Usage : pnpm payload run scripts/backfill-dons-contreparties.ts -- [options]

Backfill des commandes de don-contrepartie encaissées AVANT le déploiement de
la feature (campagne « souscription-2026 »).

MODE 1 — inventaire (défaut, lecture seule) :
  Liste les sessions Stripe payées de la campagne, sort un CSV (stdout +
  /tmp/backfill-dons-inventaire.csv) et un récapitulatif. Aucune écriture.

MODE 2 — résolution/création (dès que --execute et/ou --choix est posé) :
  Paliers fixes (15/35/75/300/500) : composition résolue automatiquement.
  Paliers à choix (50/100/200/1000) : nécessitent une ligne dans --choix
  (sinon « en attente de choix », re-scrutable au prochain run).
  Sans --execute : dry-run — affiche ce qui SERAIT fait, n'écrit rien.

Options :
  --execute          Écrit réellement (crée les commandes via le pipeline du
                      webhook, idempotent — relancer est TOUJOURS sans
                      double effet). Défaut : dry-run.
  --choix <fichier>   CSV des choix des donateurs pour les paliers à choix —
                      une ligne "sessionId;sectionId:optionId[,sectionId:optionId]".
  --mail              Renvoie le mail de remerciement enrichi (défaut : NON —
                      les donateurs ont déjà reçu le remerciement simple).
  --help, -h          Affiche cette aide et quitte (aucune I/O réseau/BDD).
`;

interface CliOptions {
  execute: boolean;
  choix: string | undefined;
  mail: boolean;
  help: boolean;
}

function parseCliOptions(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      execute: { type: "boolean", default: false },
      choix: { type: "string" },
      mail: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });
  return {
    execute: values.execute === true,
    choix: typeof values.choix === "string" ? values.choix : undefined,
    mail: values.mail === true,
    help: values.help === true,
  };
}

/* ─────────────────────────── environnement ─────────────────────────── */

/** Vérification de présence au démarrage (message clair, même esprit que `seed-users.ts`) — avant toute I/O réseau/BDD. */
function checkRequiredEnv(): void {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.PAYLOAD_SECRET) missing.push("PAYLOAD_SECRET");
  if (!stripeEnabled()) missing.push("STRIPE_SECRET_KEY (sk_test_… ou sk_live_… attendue)");
  if (missing.length > 0) {
    console.error(`[backfill-dons] variable(s) d'environnement manquante(s)/invalide(s) : ${missing.join(", ")} — abandon.`);
    // Le .env local du repo ne porte volontairement PAS les accès prod : ils
    // se sourcent explicitement depuis .env.vercel.prod, jamais par défaut.
    console.error(
      "[backfill-dons] pour viser la prod : set -a && source .env.vercel.prod && set +a && pnpm backfill:dons",
    );
    process.exit(1);
  }
}

/* ─────────────────────────── Stripe : liste des sessions ─────────────────────────── */

/** 2026-08-19T00:00:00Z (epoch secondes) — veille de l'ouverture de la campagne, borne basse pour limiter la pagination (spec). */
const CAMPAIGN_CREATED_GTE = Math.floor(Date.parse("2026-08-19T00:00:00.000Z") / 1000);

/** Sessions Checkout payées de la campagne « souscription-2026 » — pagination automatique (itération asynchrone du SDK officiel). */
async function listCampaignDonationSessions(stripe: Stripe): Promise<Stripe.Checkout.Session[]> {
  const sessions: Stripe.Checkout.Session[] = [];
  const iterator = stripe.checkout.sessions.list({
    limit: 100,
    created: { gte: CAMPAIGN_CREATED_GTE },
  });
  for await (const session of iterator) {
    if (session.metadata?.campaign !== CAMPAIGN_KEY) continue;
    if (session.metadata?.kind !== "donation") continue;
    if (session.payment_status !== "paid") continue;
    sessions.push(session);
  }
  return sessions;
}

/* ─────────────────────────── Mode 1 : inventaire ─────────────────────────── */

const INVENTORY_CSV_PATH = "/tmp/backfill-dons-inventaire.csv";

async function runInventory(sessions: Stripe.Checkout.Session[]): Promise<void> {
  const rows: InventoryRow[] = [];
  for (const session of sessions) {
    const order = await findOrderBySessionId(session.id, "don");
    rows.push(
      buildInventoryRow({
        sessionId: session.id,
        createdAtISO: new Date(session.created * 1000).toISOString(),
        tierRaw: session.metadata?.tier,
        amountEuros: centsToEuros(session.amount_total ?? 0),
        email: session.customer_details?.email ?? null,
        donLinesPresent: !!session.metadata?.donLines,
        orderExists: order !== null,
      }),
    );
  }

  const csv = formatInventoryCsv(rows);
  // stdout : le CSV brut, sans BOM (lisible tel quel dans un terminal) —
  // le BOM (convention `order-export-handler.ts:csvResponse`) n'a de sens
  // que pour le FICHIER, destiné à être ouvert directement dans Excel/
  // LibreOffice (FR).
  console.log(csv);
  await writeFile(INVENTORY_CSV_PATH, `﻿${csv}`, "utf8");
  console.log(`[backfill-dons] CSV écrit : ${INVENTORY_CSV_PATH}`);

  const summary = summarizeInventory(rows);
  console.log(
    `\n[backfill-dons] récapitulatif — ${summary.total} don(s) de la campagne, ` +
      `${summary.fixedToCreate} palier(s) fixe(s) à créer, ` +
      `${summary.choiceWaiting} palier(s) à choix en attente, ` +
      `${summary.alreadyTreated} déjà traité(s)` +
      (summary.outOfScope > 0
        ? `, ${summary.outOfScope} hors périmètre (montant libre/palier inconnu)`
        : "") +
      ".",
  );
}

/* ─────────────────────────── Mode 2 : résolution/création ─────────────────────────── */

async function loadChoixMap(choixPath: string | undefined): Promise<Map<string, ContrepartieSelection>> {
  if (!choixPath) return new Map();
  const text = await readFile(choixPath, "utf8");
  const { bySession, errors } = parseChoixCsv(text);
  for (const e of errors) {
    console.warn(`[backfill-dons] --choix ligne ${e.line} ignorée — ${e.reason} : "${e.raw}"`);
  }
  console.log(`[backfill-dons] --choix : ${bySession.size} sélection(s) lue(s) depuis ${choixPath}.`);
  return bySession;
}

interface ExecutionTally {
  created: string[];
  replayed: string[];
  alreadyTreated: string[];
  outOfScope: string[];
  choiceWaiting: { sessionId: string; tierId: DonationTierId }[];
  errors: { sessionId: string; reason: string }[];
}

function emptyTally(): ExecutionTally {
  return { created: [], replayed: [], alreadyTreated: [], outOfScope: [], choiceWaiting: [], errors: [] };
}

async function runResolution(
  sessions: Stripe.Checkout.Session[],
  opts: { execute: boolean; mail: boolean; choixMap: Map<string, ContrepartieSelection> },
): Promise<void> {
  const tally = emptyTally();

  for (const session of sessions) {
    const order = await findOrderBySessionId(session.id, "don");
    const decision = decideDonationAction({
      sessionId: session.id,
      tierRaw: session.metadata?.tier,
      donLinesAlreadyPresent: !!session.metadata?.donLines,
      orderAlreadyExists: order !== null,
      choixSelection: opts.choixMap.get(session.id),
    });

    if (decision.kind === "deja-traite") {
      tally.alreadyTreated.push(session.id);
      continue;
    }
    if (decision.kind === "hors-perimetre") {
      tally.outOfScope.push(session.id);
      continue;
    }
    if (decision.kind === "choix-en-attente") {
      tally.choiceWaiting.push({ sessionId: session.id, tierId: decision.tierId });
      continue;
    }
    if (decision.kind === "erreur") {
      tally.errors.push({ sessionId: session.id, reason: decision.reason });
      console.error(`[backfill-dons] ERREUR ${session.id} (${decision.tierId}) — ${decision.reason}`);
      continue;
    }

    if (decision.kind === "rejoue-donlines-existantes") {
      if (!opts.execute) {
        console.log(
          `[backfill-dons] DRY-RUN — ${session.id} : rejouerait le pipeline (donLines déjà posée par Stripe, webhook resté en échec partiel).`,
        );
        tally.replayed.push(session.id);
        continue;
      }
      try {
        await handleDonationSessionCompleted(session, {
          skipThanksMail: !opts.mail,
          paidAtISOOverride: new Date(session.created * 1000).toISOString(),
        });
        tally.replayed.push(session.id);
        console.log(`[backfill-dons] rejouée : ${session.id}`);
      } catch (err) {
        const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
        tally.errors.push({ sessionId: session.id, reason });
        console.error(`[backfill-dons] ERREUR ${session.id} — ${reason}`);
      }
      continue;
    }

    // decision.kind === "resolu" — palier fixe, ou palier à choix avec sélection valide.
    const books = await getContrepartieBooksBySlugs(decision.items.map((i) => i.slug));
    const missingSlug = decision.items.find((i) => !books.has(i.slug));
    if (missingSlug) {
      const reason = `slug introuvable en base : ${missingSlug.slug} (palier ${decision.tierId})`;
      tally.errors.push({ sessionId: session.id, reason });
      console.error(`[backfill-dons] ERREUR ${session.id} — ${reason}`);
      continue; // jamais de commande partielle
    }

    const lines = decision.items.map((item) => ({
      id: books.get(item.slug)!.id,
      qty: item.qty,
      unitPriceCents: 0,
    }));
    const donLines = encodeCheckoutLines(lines);

    if (!opts.execute) {
      console.log(
        `[backfill-dons] DRY-RUN — ${session.id} (${decision.tierId}) : créerait ${lines.length} ligne(s) — ` +
          `${decision.items.map((i) => `${i.slug}×${i.qty}`).join(", ")}.`,
      );
      tally.created.push(session.id);
      continue;
    }

    // Jamais réécrit chez Stripe — modification EN MÉMOIRE de l'objet
    // session local, lue par `handleDonationSessionCompleted` exactement
    // comme si elle venait du webhook.
    session.metadata = { ...(session.metadata ?? {}), donLines };
    try {
      await handleDonationSessionCompleted(session, {
        skipThanksMail: !opts.mail,
        paidAtISOOverride: new Date(session.created * 1000).toISOString(),
      });
      tally.created.push(session.id);
      console.log(`[backfill-dons] créée : ${session.id} (${decision.tierId}).`);
    } catch (err) {
      const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
      tally.errors.push({ sessionId: session.id, reason });
      console.error(`[backfill-dons] ERREUR ${session.id} — ${reason}`);
    }
  }

  printResolutionSummary(tally, opts.execute);
}

function printResolutionSummary(tally: ExecutionTally, execute: boolean): void {
  const verb = execute ? "créées" : "à créer (dry-run)";
  console.log(`\n[backfill-dons] résumé (${execute ? "EXÉCUTION" : "DRY-RUN"}) :`);
  console.log(`  - ${verb} : ${tally.created.length}${tally.created.length ? " — " + tally.created.join(", ") : ""}`);
  console.log(
    `  - rejouées (donLines déjà posée) : ${tally.replayed.length}${tally.replayed.length ? " — " + tally.replayed.join(", ") : ""}`,
  );
  console.log(
    `  - sautées, déjà traitées : ${tally.alreadyTreated.length}${tally.alreadyTreated.length ? " — " + tally.alreadyTreated.join(", ") : ""}`,
  );
  console.log(
    `  - sautées, choix manquant (en attente) : ${tally.choiceWaiting.length}` +
      (tally.choiceWaiting.length
        ? " — " + tally.choiceWaiting.map((c) => `${c.sessionId} (${c.tierId})`).join(", ")
        : ""),
  );
  console.log(
    `  - sautées, hors périmètre (montant libre/palier inconnu) : ${tally.outOfScope.length}` +
      (tally.outOfScope.length ? " — " + tally.outOfScope.join(", ") : ""),
  );
  console.log(`  - erreurs : ${tally.errors.length}`);
  for (const e of tally.errors) console.log(`      ${e.sessionId} — ${e.reason}`);
}

/* ─────────────────────────── main ─────────────────────────── */

async function main(): Promise<void> {
  const opts = parseCliOptions(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  checkRequiredEnv();

  const stripe = getStripe();
  // Instance mémoïsée par process (Payload) — même singleton que celui
  // rouvert en interne par les seams appelés plus bas (`order-source.ts`,
  // `contreparties.ts`, `order-handler.ts` via `@payload-config`) ; obtenue
  // ici uniquement pour un `payload.destroy()` propre en sortie, même
  // convention que les autres scripts `payload run` du dépôt.
  const payload = await getPayload({ config });
  try {
    console.log(
      `[backfill-dons] recherche des sessions Stripe payées de la campagne « ${CAMPAIGN_KEY} » depuis le 2026-08-19…`,
    );
    const sessions = await listCampaignDonationSessions(stripe);
    console.log(`[backfill-dons] ${sessions.length} session(s) payée(s) retenue(s).`);

    const mode: "inventaire" | "resolution" = opts.execute || opts.choix ? "resolution" : "inventaire";

    if (mode === "inventaire") {
      await runInventory(sessions);
      return;
    }

    const choixMap = await loadChoixMap(opts.choix);
    console.log(
      `[backfill-dons] mode=résolution — ${opts.execute ? "EXÉCUTION (écrit réellement)" : "dry-run (rien n'est écrit)"}, ` +
        `mail=${opts.mail ? "oui" : "non (défaut)"}.`,
    );
    await runResolution(sessions, { execute: opts.execute, mail: opts.mail, choixMap });
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
  console.error("[backfill-dons] ÉCHEC —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
}
