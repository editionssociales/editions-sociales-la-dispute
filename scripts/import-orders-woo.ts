/**
 * Import one-shot de l'historique des commandes WooCommerce (6 388 commandes,
 * 2018 → 2026-08-19, dump final de l'ancienne boutique) dans la collection
 * Payload `orders`.
 *
 * Usage : `pnpm payload run scripts/import-orders-woo.ts -- [--commit] [--help]`
 * (DRY-RUN par défaut — `--commit` seul déclenche des écritures réelles).
 *
 * Source MariaDB (dump chargé localement, jamais la prod) — paramètres par
 * variable d'environnement :
 *   WOO_DB_HOST     (défaut 127.0.0.1)
 *   WOO_DB_PORT     (défaut 13306)
 *   WOO_DB_USER     (défaut root)
 *   WOO_DB_PASSWORD (défaut vide)
 *   WOO_DB_NAME     (défaut editionsk884 — nom réel constaté dans l'en-tête
 *                     du dump, `-- Host: localhost    Database: editionsk884`)
 *
 * Tout le métier (transformation, appariement produit → books, agrégats du
 * rapport) vit dans `import-orders-woo-core.ts` (pur, testé) — ce module ne
 * fait que l'I/O : lecture MariaDB (`mysql2/promise`), lecture
 * `src/lib/redirects-produits.json`, lecture/écriture Payload (Local API),
 * écriture du rapport JSON + résumé Markdown.
 *
 * Écriture Payload (`--commit`) : `payload.create({collection:'orders', ...,
 * overrideAccess: true, context: {disableRevalidate: true}})` — mêmes
 * options que le SEUL autre chemin d'écriture `orders` du dépôt
 * (`src/lib/order-source.ts:createOrder`). La fiche de repli (`books`,
 * créée seulement en `--commit` si absente) utilise
 * `context: {migration: true, disableRevalidate: true}` — même combo que
 * `order-source.ts:decrementBookStock`, seule autre écriture `books`
 * automatisée du dépôt.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import mysql from "mysql2/promise";
import { getPayload, ValidationError, type Payload } from "payload";
import config from "../src/payload.config.ts";

import type { Book } from "../src/payload-types.ts";

import {
  aggregateImportReport,
  buildOrderLines,
  buildProductMappingReport,
  buildProductMatchIndex,
  PRECOMMANDE_PRODUCT_ID,
  resolvePrecommandeBook,
  transformOrder,
  type BookIndexEntry,
  type ImportReportTotals,
  type OrderCreateWooData,
  type ProductMappingRow,
  type ProductMatchIndex,
  type RedirectEntry,
  type TransformResult,
  type WooAddressRaw,
  type WooLineItemInput,
  type WooOrderInput,
  type WooProductRef,
} from "./import-orders-woo-core.ts";

/* ─────────────────────────── CLI ─────────────────────────── */

const HELP = `Usage : pnpm payload run scripts/import-orders-woo.ts -- [options]

Importe l'historique complet des commandes WooCommerce (dump MariaDB local,
/tmp/woo-final) dans la collection Payload "orders".

Options :
  --commit     Écrit réellement (création des commandes + fiche de repli au
               besoin). Par défaut : DRY-RUN — calcule tout, écrit le
               rapport, ne touche à rien.
  --help, -h   Affiche cette aide et quitte (aucune I/O réseau/BDD).
`;

interface CliOptions {
  commit: boolean;
  help: boolean;
}

function parseCliOptions(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      commit: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });
  return { commit: values.commit === true, help: values.help === true };
}

/* ─────────────────────────── MariaDB : lecture ─────────────────────────── */

const WOO_DB_HOST = process.env.WOO_DB_HOST || "127.0.0.1";
const WOO_DB_PORT = Number(process.env.WOO_DB_PORT || "13306");
const WOO_DB_USER = process.env.WOO_DB_USER || "root";
const WOO_DB_PASSWORD = process.env.WOO_DB_PASSWORD || "";
// Nom réel constaté dans l'en-tête du dump final (`-- Host: localhost    Database: editionsk884`).
const WOO_DB_NAME = process.env.WOO_DB_NAME || "editionsk884";

const ORDER_META_KEYS = [
  "_billing_first_name",
  "_billing_last_name",
  "_billing_address_1",
  "_billing_address_2",
  "_billing_city",
  "_billing_postcode",
  "_billing_country",
  "_billing_email",
  "_shipping_first_name",
  "_shipping_last_name",
  "_shipping_address_1",
  "_shipping_address_2",
  "_shipping_city",
  "_shipping_postcode",
  "_shipping_country",
  "_order_shipping",
  "_cart_discount",
  "_order_total",
  "_date_paid",
  "_paid_date",
] as const;

interface OrderMetaRow {
  id: number;
  postStatus: string;
  postDate: string | null;
  postDateGmt: string | null;
  billingFirstName: string | null;
  billingLastName: string | null;
  billingAddress1: string | null;
  billingAddress2: string | null;
  billingCity: string | null;
  billingPostcode: string | null;
  billingCountry: string | null;
  billingEmail: string | null;
  shippingFirstName: string | null;
  shippingLastName: string | null;
  shippingAddress1: string | null;
  shippingAddress2: string | null;
  shippingCity: string | null;
  shippingPostcode: string | null;
  shippingCountry: string | null;
  orderShipping: string | null;
  cartDiscount: string | null;
  orderTotal: string | null;
  datePaid: string | null;
  paidDate: string | null;
}

interface LineItemRow {
  orderId: number;
  orderItemId: number;
  orderItemName: string;
  productId: string | null;
  qty: string | null;
  lineSubtotal: string | null;
}

interface ShippingItemRow {
  orderId: number;
  orderItemId: number;
  label: string;
}

interface ProductRow {
  id: number;
  slug: string;
  title: string;
}

async function connectWooDb(): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: WOO_DB_HOST,
    port: WOO_DB_PORT,
    user: WOO_DB_USER,
    password: WOO_DB_PASSWORD,
    database: WOO_DB_NAME,
    charset: "utf8mb4",
    // CRITIQUE : sans ça, `mysql2` convertit `post_date`/`post_date_gmt`
    // (colonnes DATETIME) en objets `Date` JS via le fuseau du PROCESS, pas
    // du texte naïf — exactement la corruption que `computeCreatedAt`
    // (`import-orders-woo-core.ts`) est écrit pour éviter (elle interprète
    // elle-même le naïf, UTC ou Paris selon la colonne). Avec `dateStrings`,
    // ces colonnes reviennent en `'YYYY-MM-DD HH:MM:SS'` brut, comme
    // `_paid_date` (déjà une chaîne, stockée en `longtext` dans postmeta).
    // Constaté en validation (`/tmp/validate-woo-import.mts`) : sans ce
    // réglage, LES 6 388 commandes étaient exclues (« date illisible »,
    // `Date.prototype.trim` n'existe pas).
    dateStrings: true,
    // Le dump contient 6 388 commandes × ~20 clés de meta — largement sous la
    // limite par défaut, posée explicitement par prudence (le pivot en
    // MAX(CASE …) charge tout en un aller-retour, pas de streaming).
    multipleStatements: false,
  });
}

const P = (prefix: string): string => `mod973_${prefix}`;

/** Une ligne par commande (`mod973_posts`), pivot des clés `ORDER_META_KEYS` en colonnes (`MAX(CASE …)`). */
async function fetchOrderMetaRows(conn: mysql.Connection): Promise<OrderMetaRow[]> {
  const caseFor = (alias: string, key: string): string =>
    `MAX(CASE WHEN pm.meta_key='${key}' THEN pm.meta_value END) AS ${alias}`;
  const sql = `
    SELECT
      p.ID AS id,
      p.post_status AS postStatus,
      p.post_date AS postDate,
      p.post_date_gmt AS postDateGmt,
      ${caseFor("billingFirstName", "_billing_first_name")},
      ${caseFor("billingLastName", "_billing_last_name")},
      ${caseFor("billingAddress1", "_billing_address_1")},
      ${caseFor("billingAddress2", "_billing_address_2")},
      ${caseFor("billingCity", "_billing_city")},
      ${caseFor("billingPostcode", "_billing_postcode")},
      ${caseFor("billingCountry", "_billing_country")},
      ${caseFor("billingEmail", "_billing_email")},
      ${caseFor("shippingFirstName", "_shipping_first_name")},
      ${caseFor("shippingLastName", "_shipping_last_name")},
      ${caseFor("shippingAddress1", "_shipping_address_1")},
      ${caseFor("shippingAddress2", "_shipping_address_2")},
      ${caseFor("shippingCity", "_shipping_city")},
      ${caseFor("shippingPostcode", "_shipping_postcode")},
      ${caseFor("shippingCountry", "_shipping_country")},
      ${caseFor("orderShipping", "_order_shipping")},
      ${caseFor("cartDiscount", "_cart_discount")},
      ${caseFor("orderTotal", "_order_total")},
      ${caseFor("datePaid", "_date_paid")},
      ${caseFor("paidDate", "_paid_date")}
    FROM ${P("posts")} p
    LEFT JOIN ${P("postmeta")} pm
      ON pm.post_id = p.ID AND pm.meta_key IN (${ORDER_META_KEYS.map((k) => `'${k}'`).join(",")})
    WHERE p.post_type = 'shop_order'
    GROUP BY p.ID
    ORDER BY p.ID
  `;
  const [rows] = await conn.query<mysql.RowDataPacket[]>(sql);
  return rows as unknown as OrderMetaRow[];
}

/** Lignes `line_item` (`order_item_id` = clé), `_product_id`/`_qty`/`_line_subtotal` pivotés. */
async function fetchLineItemRows(conn: mysql.Connection): Promise<LineItemRow[]> {
  const sql = `
    SELECT
      oi.order_id AS orderId,
      oi.order_item_id AS orderItemId,
      oi.order_item_name AS orderItemName,
      MAX(CASE WHEN oim.meta_key='_product_id' THEN oim.meta_value END) AS productId,
      MAX(CASE WHEN oim.meta_key='_qty' THEN oim.meta_value END) AS qty,
      MAX(CASE WHEN oim.meta_key='_line_subtotal' THEN oim.meta_value END) AS lineSubtotal
    FROM ${P("woocommerce_order_items")} oi
    LEFT JOIN ${P("woocommerce_order_itemmeta")} oim
      ON oim.order_item_id = oi.order_item_id AND oim.meta_key IN ('_product_id','_qty','_line_subtotal')
    WHERE oi.order_item_type = 'line_item'
    GROUP BY oi.order_item_id
    ORDER BY oi.order_id, oi.order_item_id
  `;
  const [rows] = await conn.query<mysql.RowDataPacket[]>(sql);
  return rows as unknown as LineItemRow[];
}

/** Lignes `shipping` — seul le libellé (`order_item_name`) sert (le coût vient de `_order_shipping`, au niveau commande). */
async function fetchShippingItemRows(conn: mysql.Connection): Promise<ShippingItemRow[]> {
  const sql = `
    SELECT order_id AS orderId, order_item_id AS orderItemId, order_item_name AS label
    FROM ${P("woocommerce_order_items")}
    WHERE order_item_type = 'shipping'
    ORDER BY order_id, order_item_id
  `;
  const [rows] = await conn.query<mysql.RowDataPacket[]>(sql);
  return rows as unknown as ShippingItemRow[];
}

/** Produits Woo existants (`post_type='product'`) — id/slug/titre bruts, appariement (`matchProduct`). */
async function fetchProductRows(conn: mysql.Connection): Promise<ProductRow[]> {
  const sql = `SELECT ID AS id, post_name AS slug, post_title AS title FROM ${P("posts")} WHERE post_type='product'`;
  const [rows] = await conn.query<mysql.RowDataPacket[]>(sql);
  return rows as unknown as ProductRow[];
}

function toAddress(prefix: "billing" | "shipping", row: OrderMetaRow): WooAddressRaw {
  if (prefix === "billing") {
    return {
      firstName: row.billingFirstName,
      lastName: row.billingLastName,
      address1: row.billingAddress1,
      address2: row.billingAddress2,
      city: row.billingCity,
      postcode: row.billingPostcode,
      country: row.billingCountry,
    };
  }
  return {
    firstName: row.shippingFirstName,
    lastName: row.shippingLastName,
    address1: row.shippingAddress1,
    address2: row.shippingAddress2,
    city: row.shippingCity,
    postcode: row.shippingPostcode,
    country: row.shippingCountry,
  };
}

/** Assemble les 3 requêtes MariaDB (commandes, lignes, ports) en `WooOrderInput[]` — un objet par commande, ordre `ID`. */
function assembleOrders(
  orderRows: OrderMetaRow[],
  lineRows: LineItemRow[],
  shippingRows: ShippingItemRow[],
): WooOrderInput[] {
  const linesByOrder = new Map<number, WooLineItemInput[]>();
  for (const l of lineRows) {
    const arr = linesByOrder.get(l.orderId) ?? [];
    arr.push({
      orderItemId: l.orderItemId,
      productId: l.productId != null ? Number(l.productId) : 0,
      orderItemName: l.orderItemName,
      qty: l.qty,
      lineSubtotal: l.lineSubtotal,
    });
    linesByOrder.set(l.orderId, arr);
  }

  // Un seul libellé de port par commande — premier `order_item_id` si
  // plusieurs lignes shipping (cas non observé dans le dump).
  const shippingByOrder = new Map<number, string>();
  for (const s of shippingRows) {
    if (!shippingByOrder.has(s.orderId)) shippingByOrder.set(s.orderId, s.label);
  }

  return orderRows.map((row) => ({
    id: row.id,
    postStatus: row.postStatus,
    postDate: row.postDate,
    postDateGmt: row.postDateGmt,
    billing: toAddress("billing", row),
    shipping: toAddress("shipping", row),
    billingEmail: row.billingEmail,
    orderShipping: row.orderShipping,
    cartDiscount: row.cartDiscount,
    orderTotal: row.orderTotal,
    datePaid: row.datePaid,
    paidDate: row.paidDate,
    lines: linesByOrder.get(row.id) ?? [],
    shippingLabel: shippingByOrder.get(row.id) ?? null,
  }));
}

/* ─────────────────────────── redirects-produits.json ─────────────────────────── */

const REDIRECTS_FILE = path.join(process.cwd(), "src/lib/redirects-produits.json");

async function readRedirectEntries(): Promise<Record<string, RedirectEntry>> {
  const parsed: unknown = JSON.parse(await readFile(REDIRECTS_FILE, "utf8"));
  const entries = (parsed as { entries?: unknown }).entries;
  if (entries == null || typeof entries !== "object") {
    throw new Error(`[import-orders-woo] table de redirections illisible : ${REDIRECTS_FILE}`);
  }
  return entries as Record<string, RedirectEntry>;
}

/* ─────────────────────────── Payload : books (lecture) ─────────────────────────── */

async function fetchAllBooks(payload: Payload): Promise<BookIndexEntry[]> {
  const { docs } = await payload.find({
    collection: "books",
    overrideAccess: true,
    // Un produit Woo peut légitimement s'apparier à une fiche encore en
    // brouillon (import antérieur à sa publication) — jamais de brouillon
    // silencieusement exclu de l'appariement.
    draft: true,
    depth: 0,
    limit: 0,
    select: { slug: true, edition: true, isbn: true, title: true, origin: true },
  });
  return (docs as Book[]).map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    edition: (doc.edition ?? null) as BookIndexEntry["edition"],
    isbn: doc.isbn ?? null,
    title: doc.title,
    origin: doc.origin,
  }));
}

/* ─────────────────────────── Payload : fiche de repli ─────────────────────────── */

const FALLBACK_BOOK_SLUG = "archive-boutique-woo";
const FALLBACK_BOOK_TITLE = "Archive boutique (produit disparu)";
/** Sentinel utilisé en dry-run quand la fiche de repli n'existe pas encore (jamais écrit — aucun `payload.create` en dry-run). */
const FALLBACK_SENTINEL_ID = -1;

/**
 * Contenu Lexical minimal valide (`presentation`, champ requis) — même forme
 * que l'état vide d'un éditeur Lexical Payload (cf. fixtures
 * `src/lib/catalogue-pg-map.test.ts`). Cette fiche n'est un support éditorial
 * pour personne : le texte est un mot pour compte, pas une "présentation".
 */
const FALLBACK_BOOK_PRESENTATION = {
  root: {
    type: "root",
    format: "" as const,
    indent: 0,
    version: 1,
    direction: "ltr" as const,
    children: [
      {
        type: "paragraph",
        format: "" as const,
        indent: 0,
        version: 1,
        direction: "ltr" as const,
        children: [
          {
            type: "text",
            format: 0,
            style: "",
            mode: "normal",
            detail: 0,
            version: 1,
            text:
              "Fiche technique générée par l'import de l'historique des ventes WooCommerce " +
              "(scripts/import-orders-woo.ts) — jamais publiée, jamais affichée sur le site public.",
          },
        ],
      },
    ],
  },
};

interface FallbackBookResult {
  id: number;
  created: boolean;
}

/**
 * Résout (ou crée en `--commit`) la fiche de repli des produits Woo jamais
 * appariés (bucket `repli`). INVISIBILITÉ PUBLIQUE : `_status: 'draft'`,
 * jamais publiée — la policy `read` de `Books.ts`
 * (`_status: { equals: 'published' }` pour un visiteur anonyme) exclut donc
 * cette fiche de TOUTE lecture publique (`overrideAccess: false`), qui est
 * le mode de lecture de `PUBLIC_BOOKS_READ` (`src/lib/catalogue-source.ts`)
 * utilisé par les DEUX chemins publics qui listent des livres :
 * `catalogue-pg.ts:listBooks` (fiches de fonds, filtrées par `edition`) et
 * `catalogue-pg.ts:listBoutiqueOnlyBooks` (grille `/boutique`, filtrée par
 * `origin: 'boutique'`). Comme cette fiche n'est jamais publiée, aucune des
 * deux requêtes ne peut jamais la renvoyer — mécanisme vérifié dans le code
 * (pas une convention à espérer), même patron que `sweepMissing` de feu
 * `scripts/migrate-catalogue/import.ts` (`git show aef3282^`, qui dépublie
 * déjà les fiches disparues en posant `_status: 'draft'`).
 */
async function resolveFallbackBook(payload: Payload, commit: boolean): Promise<FallbackBookResult> {
  const existing = await payload.find({
    collection: "books",
    where: { slug: { equals: FALLBACK_BOOK_SLUG } },
    overrideAccess: true,
    draft: true,
    depth: 0,
    limit: 1,
  });
  const found = existing.docs[0];
  if (found) return { id: found.id, created: false };

  if (!commit) return { id: FALLBACK_SENTINEL_ID, created: false };

  const created = await payload.create({
    collection: "books",
    data: {
      title: FALLBACK_BOOK_TITLE,
      slug: FALLBACK_BOOK_SLUG,
      origin: "boutique",
      edition: null,
      // Requis par le schéma (`dateParution`) ; purement technique ici — la
      // date du run n'a aucune signification éditoriale sur une fiche jamais
      // publiée.
      dateParution: new Date().toISOString(),
      presentation: FALLBACK_BOOK_PRESENTATION,
    },
    // `draft: true` (option, pas juste `data._status`) : c'est CETTE option
    // qui fait poser `_status: 'draft'` par `createOperation`
    // (`payload/dist/collections/operations/create.js`) — le typage Payload
    // l'exige explicitement dès que la donnée est une "draft data". Fiche
    // JAMAIS publiée ensuite (aucun autre appel ne la touche) : c'est le
    // mécanisme d'invisibilité publique lui-même, cf. docstring ci-dessus.
    draft: true,
    overrideAccess: true,
    context: { migration: true, disableRevalidate: true },
  });
  return { id: created.id, created: true };
}

/* ─────────────────────────── Payload : idempotence ─────────────────────────── */

/**
 * Tous les `stripeSessionId` déjà présents commençant par `woo-` (import déjà
 * joué). `like` fait un `%mot%` (contient), pas un `LIKE 'woo-%'` littéral
 * (`@payloadcms/drizzle:queries/parseParams.js`) — sans risque ici : aucun id
 * de session Stripe réel (`cs_live_…`/`cs_test_…`) ne contient la sous-chaîne
 * `woo-`, seuls CES imports la posent.
 */
async function fetchExistingWooOrderIds(payload: Payload): Promise<Set<number>> {
  const ids = new Set<number>();
  let page = 1;
  for (;;) {
    const result = await payload.find({
      collection: "orders",
      where: { stripeSessionId: { like: "woo-" } },
      select: { stripeSessionId: true },
      overrideAccess: true,
      depth: 0,
      limit: 500,
      page,
    });
    for (const doc of result.docs) {
      const m = /^woo-(\d+)$/.exec(doc.stripeSessionId ?? "");
      if (m) ids.add(Number(m[1]));
    }
    if (!result.hasNextPage) break;
    page += 1;
  }
  return ids;
}

/* ─────────────────────────── Payload : écriture (commit) ─────────────────────────── */

interface CommitStats {
  created: number;
  skippedIdempotent: number;
  skippedUniqueViolation: number;
  failed: { wooId: number; error: string }[];
}

const CREATE_CONCURRENCY = 5;

async function createOrders(
  payload: Payload,
  toCreate: { wooId: number; data: OrderCreateWooData }[],
): Promise<Pick<CommitStats, "created" | "skippedUniqueViolation" | "failed">> {
  let created = 0;
  let skippedUniqueViolation = 0;
  const failed: CommitStats["failed"] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= toCreate.length) return;
      const item = toCreate[i];
      try {
        await payload.create({
          collection: "orders",
          data: item.data,
          overrideAccess: true,
          context: { disableRevalidate: true },
        });
        created += 1;
      } catch (err) {
        // Ceinture-bretelles idempotence (spec) : une violation d'unicité
        // (stripeSessionId+orderType, `Orders.ts:indexes`) traduite en
        // ValidationError par @payloadcms/drizzle (pg 23505) compte en skip,
        // pas en échec — un doublon de run concurrent ne doit jamais
        // remonter comme une erreur d'import.
        if (err instanceof ValidationError) {
          skippedUniqueViolation += 1;
        } else {
          failed.push({ wooId: item.wooId, error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CREATE_CONCURRENCY }, () => worker()));
  return { created, skippedUniqueViolation, failed };
}

/* ─────────────────────────── Rapport ─────────────────────────── */

const OUT_DIR = path.join(process.cwd(), "scripts/import-orders-woo-out");

interface FullReport {
  generatedAt: string;
  mode: "dry-run" | "commit";
  wooDb: { host: string; port: number; database: string };
  precommandeBook: { id: number; slug: string; title: string };
  fallbackBook: { id: number; created: boolean; slug: string };
  totals: ImportReportTotals;
  productMapping: ProductMappingRow[];
  commit: CommitStats | null;
}

function buildMarkdownSummary(report: FullReport): string {
  const t = report.totals;
  const lines: string[] = [];
  lines.push(`# Import commandes WooCommerce — ${report.mode === "commit" ? "COMMIT" : "dry-run"}`);
  lines.push("");
  lines.push(`Généré le ${report.generatedAt}. Base source : \`${report.wooDb.database}\` (${report.wooDb.host}:${report.wooDb.port}).`);
  lines.push("");
  lines.push("## Totaux");
  lines.push("");
  lines.push(`- Commandes lues : ${t.totalOrders}`);
  lines.push(`- Transformées avec succès : ${t.created}`);
  lines.push(`- Exclues : ${t.excluded}`);
  lines.push("");
  lines.push("### Par statut cible");
  lines.push("");
  for (const [status, count] of Object.entries(t.byStatus).sort()) {
    const sum = t.sumTotalTTCByStatus[status] ?? 0;
    lines.push(`- ${status} : ${count} commande(s), Σ totalTTC = ${sum.toFixed(2)} €`);
  }
  lines.push("");
  lines.push("### Par type");
  lines.push("");
  lines.push(`- commande : ${t.byOrderType.commande}`);
  lines.push(`- precommande : ${t.byOrderType.precommande}`);
  lines.push("");
  lines.push(`## Précommande obligatoire (produit ${PRECOMMANDE_PRODUCT_ID})`);
  lines.push("");
  lines.push(
    `Résolue vers la fiche id=${report.precommandeBook.id}, slug=\`${report.precommandeBook.slug}\`, titre « ${report.precommandeBook.title} ».`,
  );
  lines.push(`Commandes mixtes (précommande + autre livre) : ${t.mixedPrecommandeOrders.length} — ${t.mixedPrecommandeOrders.join(", ") || "aucune"}.`);
  lines.push("");
  lines.push("## Fiche de repli");
  lines.push("");
  lines.push(
    `id=${report.fallbackBook.id === FALLBACK_SENTINEL_ID ? "(inexistante — sera créée au premier --commit)" : report.fallbackBook.id}, ` +
      `slug=\`${report.fallbackBook.slug}\`, ${report.fallbackBook.created ? "créée par ce run" : "déjà existante"}.`,
  );
  lines.push("");
  lines.push("## Réparations e-mail");
  lines.push("");
  lines.push(`${t.emailRepairs.length} réparation(s) :`);
  for (const r of t.emailRepairs) lines.push(`- commande Woo #${r.wooId} — méthode : ${r.method}`);
  lines.push("");
  lines.push("## Replis pays (hors FR/BE/CH)");
  lines.push("");
  lines.push(`${t.countryRepairs.length} repli(s) :`);
  for (const r of t.countryRepairs) lines.push(`- commande Woo #${r.wooId} (${r.scope}) — code source : ${r.code}`);
  lines.push("");
  lines.push("## Mismatches arithmétiques (> 0,02 €)");
  lines.push("");
  lines.push(`${t.arithmeticMismatches.length} commande(s) : ${t.arithmeticMismatches.join(", ") || "aucune"}.`);
  lines.push("");
  lines.push("## wc-on-hold (11 cas attendus)");
  lines.push("");
  for (const c of t.onHoldCases) lines.push(`- commande Woo #${c.wooId} → ${c.resultStatus}`);
  lines.push("");
  lines.push("## Commandes post-bascule (post_date ≥ 2026-08-19, « à expédier »)");
  lines.push("");
  lines.push(t.postBasculeOrders.map((id) => `#${id}`).join(", ") || "aucune");
  lines.push("");
  lines.push(`## Anomalies de quantité (\`_qty\` 0/vide → 1)`);
  lines.push("");
  lines.push(`${t.qtyAnomalyOrders} commande(s) concernée(s).`);
  lines.push("");
  lines.push("## Exclusions");
  lines.push("");
  for (const e of t.exclusions) lines.push(`- commande Woo #${e.wooId} — ${e.reason}`);
  lines.push("");
  lines.push("## Mapping produit → fiche (par bucket)");
  lines.push("");
  lines.push("| product_id | titre | bucket | book id | book slug | nb lignes |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of report.productMapping) {
    lines.push(
      `| ${row.productId} | ${(row.productTitle ?? "(produit supprimé)").replace(/\|/g, "\\|")} | ${row.bucket} | ${row.bookId ?? "—"} | ${row.bookSlug ?? "—"} | ${row.lineCount} |`,
    );
  }
  lines.push("");
  const repliRows = report.productMapping.filter((r) => r.bucket === "repli");
  lines.push(`### Section repli (${repliRows.length} produit(s))`);
  lines.push("");
  for (const row of repliRows) lines.push(`- product_id ${row.productId} (${row.productTitle ?? "produit supprimé"}) — ${row.lineCount} ligne(s)`);
  lines.push("");
  const titleRows = report.productMapping.filter((r) => r.bucket === "titre" || r.bucket === "titre-ligne");
  lines.push(`### Appariements par titre (${titleRows.length} produit(s), buckets \`titre\`/\`titre-ligne\`)`);
  lines.push("");
  for (const row of titleRows) {
    lines.push(`- product_id ${row.productId} (${row.productTitle ?? "produit supprimé"}) → book ${row.bookId} (\`${row.bookSlug}\`) [${row.bucket}]`);
  }
  lines.push("");

  if (report.commit) {
    lines.push("## Écriture (--commit)");
    lines.push("");
    lines.push(`- Créées : ${report.commit.created}`);
    lines.push(`- Sautées (idempotence, déjà importées) : ${report.commit.skippedIdempotent}`);
    lines.push(`- Sautées (violation d'unicité, ceinture-bretelles) : ${report.commit.skippedUniqueViolation}`);
    lines.push(`- Échecs : ${report.commit.failed.length}`);
    for (const f of report.commit.failed) lines.push(`  - Woo #${f.wooId} : ${f.error}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function writeReport(report: FullReport): Promise<{ jsonPath: string; mdPath: string }> {
  await mkdir(OUT_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const base = `rapport-${report.mode}-${stamp}`;
  const jsonPath = path.join(OUT_DIR, `${base}.json`);
  const mdPath = path.join(OUT_DIR, `${base}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(mdPath, buildMarkdownSummary(report), "utf8");
  return { jsonPath, mdPath };
}

/* ─────────────────────────── main ─────────────────────────── */

async function main(): Promise<void> {
  const opts = parseCliOptions(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  console.log(`[import-orders-woo] démarrage — mode=${opts.commit ? "COMMIT" : "dry-run"}`);

  const conn = await connectWooDb();
  let orders: WooOrderInput[];
  let productRows: ProductRow[];
  try {
    console.log(`[import-orders-woo] lecture MariaDB ${WOO_DB_HOST}:${WOO_DB_PORT}/${WOO_DB_NAME}…`);
    const [orderRows, lineRows, shippingRows, products] = await Promise.all([
      fetchOrderMetaRows(conn),
      fetchLineItemRows(conn),
      fetchShippingItemRows(conn),
      fetchProductRows(conn),
    ]);
    orders = assembleOrders(orderRows, lineRows, shippingRows);
    productRows = products;
    console.log(`[import-orders-woo] ${orders.length} commande(s) Woo, ${productRows.length} produit(s) Woo lus.`);
  } finally {
    await conn.end();
  }

  const redirectEntries = await readRedirectEntries();
  const wooProducts: WooProductRef[] = productRows.map((p) => ({ id: p.id, slug: p.slug, title: p.title }));

  const payload = await getPayload({ config });
  try {
    const books = await fetchAllBooks(payload);
    console.log(`[import-orders-woo] ${books.length} fiche(s) Payload (books) lues (drafts inclus).`);

    const matchIndex: ProductMatchIndex = buildProductMatchIndex(wooProducts, redirectEntries, books);

    // ABORT explicite — AVANT tout calcul de rapport ou écriture, dry-run
    // compris : jamais de repli pour les 369 commandes de précommande
    // (spec figée).
    const precommandeBook = resolvePrecommandeBook(matchIndex);
    console.log(
      `[import-orders-woo] produit précommande obligatoire (${PRECOMMANDE_PRODUCT_ID}) résolu → ` +
        `book id=${precommandeBook.id}, slug=${precommandeBook.slug}.`,
    );

    const fallbackBook = await resolveFallbackBook(payload, opts.commit);
    if (fallbackBook.id === FALLBACK_SENTINEL_ID) {
      console.warn(
        "[import-orders-woo] fiche de repli absente — dry-run : les lignes 'repli' pointeront un id sentinel " +
          `(${FALLBACK_SENTINEL_ID}) purement indicatif dans le rapport, aucune écriture. Elle sera créée au ` +
          "premier run --commit si des lignes en ont besoin.",
    );
    } else {
      console.log(
        `[import-orders-woo] fiche de repli — id=${fallbackBook.id}${fallbackBook.created ? " (créée par ce run)" : " (déjà existante)"}.`,
      );
    }

    const existingWooIds = opts.commit ? await fetchExistingWooOrderIds(payload) : new Set<number>();
    if (opts.commit) {
      console.log(`[import-orders-woo] ${existingWooIds.size} commande(s) déjà importée(s) (idempotence) — sautées.`);
    }

    const results: TransformResult[] = [];
    const productBucketsAll: ReturnType<typeof buildOrderLines>["productBuckets"] = [];
    let skippedIdempotent = 0;

    for (const order of orders) {
      if (opts.commit && existingWooIds.has(order.id)) {
        skippedIdempotent += 1;
        continue;
      }
      const result = transformOrder(order, matchIndex, fallbackBook.id);
      results.push(result);
      if (result.kind === "ok") productBucketsAll.push(...result.flags.productBuckets);
    }

    const totals = aggregateImportReport(results);
    const productMapping = buildProductMappingReport(productBucketsAll, matchIndex);

    let commitStats: CommitStats | null = null;
    if (opts.commit) {
      const toCreate = results
        .filter((r): r is Extract<TransformResult, { kind: "ok" }> => r.kind === "ok")
        .map((r) => ({ wooId: r.wooId, data: r.data }));
      console.log(`[import-orders-woo] écriture de ${toCreate.length} commande(s) (concurrence ${CREATE_CONCURRENCY})…`);
      const written = await createOrders(payload, toCreate);
      commitStats = { ...written, skippedIdempotent };
      console.log(
        `[import-orders-woo] écriture terminée — créées=${written.created}, ` +
          `sautées(idempotence)=${skippedIdempotent}, sautées(unicité)=${written.skippedUniqueViolation}, ` +
          `échecs=${written.failed.length}.`,
      );
    }

    const report: FullReport = {
      generatedAt: new Date().toISOString(),
      mode: opts.commit ? "commit" : "dry-run",
      wooDb: { host: WOO_DB_HOST, port: WOO_DB_PORT, database: WOO_DB_NAME },
      precommandeBook: { id: precommandeBook.id, slug: precommandeBook.slug, title: precommandeBook.title },
      fallbackBook: { id: fallbackBook.id, created: fallbackBook.created, slug: FALLBACK_BOOK_SLUG },
      totals,
      productMapping,
      commit: commitStats,
    };

    const { jsonPath, mdPath } = await writeReport(report);
    console.log(`[import-orders-woo] rapport écrit :\n  - ${jsonPath}\n  - ${mdPath}`);
    console.log(
      `[import-orders-woo] résumé — lues=${orders.length}, transformées=${totals.created}, exclues=${totals.excluded}` +
        (opts.commit ? `, créées=${commitStats?.created ?? 0}` : " (dry-run, aucune écriture)"),
    );
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
  console.error("[import-orders-woo] ÉCHEC —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
}
