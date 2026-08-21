/**
 * Cœur pur de l'import one-shot des commandes WooCommerce (mission « import
 * ventes Woo », 6 388 commandes 2018→2026-08-19, dump final de l'ancienne
 * boutique) dans la collection Payload `orders`.
 *
 * Aucune I/O ici (pas de connexion MariaDB, pas de Local API Payload) : c'est
 * la surface couverte par `import-orders-woo-core.test.ts`, même découpage
 * que `catalogue-core.ts`/`migrate-products-core.ts`
 * (`src/lib/CLAUDE.md`/`scripts/`). L'orchestrateur I/O est
 * `scripts/import-orders-woo.ts` — il assemble les lignes MariaDB en
 * `WooOrderInput`, construit l'index d'appariement produit (`ProductMatchIndex`)
 * depuis la Local API + `redirects-produits.json`, puis appelle
 * `transformOrder` pour CHAQUE commande.
 *
 * Toutes les règles de transformation ci-dessous sont FIGÉES par la mission
 * (spec verbatim en commentaire au point d'application) — ce ne sont pas des
 * choix d'implémentation à revisiter sans revalider contre le dump.
 */
import type { EditionSlug } from "../src/lib/types.ts";

/* ─────────────────────────── Types de domaine ─────────────────────────── */

export type OrderStatus = "paid" | "prepared" | "shipped" | "cancelled" | "refunded" | "failed";
export type OrderKind = "commande" | "precommande";
export type OrderShippingMethod = "standard" | "reduit" | "offert";
export type OrderCountry = "FR" | "BE" | "CH";

export interface OrderAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode: string;
  city: string;
  country: OrderCountry;
}

export interface OrderLineData {
  book: number;
  titleSnapshot: string;
  isbnSnapshot: string | null;
  quantity: number;
  unitPriceTTC: number;
}

/** Payload de création `orders` — mêmes champs que `payload.create({collection:'orders', data})` (`Orders.ts`). */
export interface OrderCreateWooData {
  number: string;
  orderType: OrderKind;
  status: OrderStatus;
  email: string;
  shippingAddress: OrderAddress;
  billingAddress: OrderAddress;
  lines: OrderLineData[];
  shippingMethod: OrderShippingMethod;
  shippingCostTTC: number;
  discountTTC: number;
  totalTTC: number;
  stripeSessionId: string;
  stripePaymentIntentId: null;
  paidAt: string | null;
  stockDecremented: true;
  confirmationSent: true;
  createdAt: string;
}

/* ─────────────────────────── Statut Woo → statut Orders ───────────────────────────
 *
 * Spec (figée) :
 *   wc-completed→'shipped' ; wc-processing→'paid' ; wc-cancelled→'cancelled' ;
 *   wc-refunded→'refunded' ; wc-failed→'failed' ; wc-on-hold→'paid' SI
 *   (_date_paid ou _paid_date) SINON 'cancelled' (11 cas réels du dump — les
 *   11 n'ont ni l'un ni l'autre, donc les 11 vont à 'cancelled', vérifié
 *   contre `mod973_postmeta`). Statut inattendu → commande exclue.
 */
export function mapWooStatus(wooStatus: string, hasPaidSignal: boolean): OrderStatus | null {
  switch (wooStatus) {
    case "wc-completed":
      return "shipped";
    case "wc-processing":
      return "paid";
    case "wc-cancelled":
      return "cancelled";
    case "wc-refunded":
      return "refunded";
    case "wc-failed":
      return "failed";
    case "wc-on-hold":
      return hasPaidSignal ? "paid" : "cancelled";
    default:
      return null;
  }
}

/** Statuts cibles pour lesquels `paidAt` retombe sur `createdAt` à défaut de signal de paiement direct. */
const PAID_LIKE_STATUSES: ReadonlySet<OrderStatus> = new Set(["paid", "prepared", "shipped", "refunded"]);

/* ─────────────────────────── Dates ───────────────────────────
 *
 * `post_date_gmt`/`post_date` WordPress sont des datetimes NAÏFS (sans
 * offset) — post_date_gmt en UTC, post_date en heure LOCALE Europe/Paris
 * (convention WordPress standard). `0000-00-00 00:00:00` est la valeur
 * MySQL « zéro » d'une colonne `datetime NOT NULL` jamais renseignée.
 */

const ZERO_DATE_RE = /^0000-00-00[ T]00:00:00/;
const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

function isBlankOrZeroDate(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v === "" || ZERO_DATE_RE.test(v);
}

/** Datetime naïf déjà en UTC (`post_date_gmt`) → ISO. `null` si illisible. */
function naiveUtcToIso(naive: string): string | null {
  const m = NAIVE_DATETIME_RE.exec(naive.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

const PARIS_DATETIME_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatParisParts(d: Date): string {
  const parts = PARIS_DATETIME_FMT.formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  // `hour12: false` avec la locale `en-CA` peut rendre "24" à minuit pile
  // (piège documenté `Intl.DateTimeFormat`, cf. `src/lib/format.ts`) —
  // ramené à "00" pour comparer avec la partie horaire de la cible.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

/**
 * Datetime naïf Europe/Paris (`post_date`, `_paid_date`) → ISO UTC. Essaie
 * l'offset été (+02:00) puis hiver (+01:00) et retient celui dont l'instant
 * obtenu redonne exactement la même date/heure locale à Paris (même
 * technique que `parisMidnightUtc`, `src/lib/format.ts`, généralisée à une
 * heure quelconque). Repli hiver (+01:00) si aucun des deux ne boucle
 * exactement — transition DST, cas non rencontré dans le dump. `null` si le
 * datetime est illisible.
 */
export function parisNaiveToUtcIso(naive: string): string | null {
  const m = NAIVE_DATETIME_RE.exec(naive.trim());
  if (!m) return null;
  const target = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  for (const offset of ["+02:00", "+01:00"]) {
    const candidate = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`);
    if (Number.isNaN(candidate.getTime())) continue;
    if (formatParisParts(candidate) === target) return candidate.toISOString();
  }
  const fallback = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+01:00`);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

/**
 * `createdAt` = `post_date_gmt` traité comme UTC → ISO. Si `post_date_gmt`
 * nul/`0000-00-00…` → `post_date` interprété Europe/Paris. Jette si aucun des
 * deux n'est exploitable (aucun cas réel dans le dump — les deux garde-fous
 * sont défensifs) ; l'appelant (`transformOrder`) traduit en exclusion.
 */
export function computeCreatedAt(postDateGmt: string | null, postDate: string | null): string {
  if (!isBlankOrZeroDate(postDateGmt)) {
    const iso = naiveUtcToIso(postDateGmt as string);
    if (iso) return iso;
  }
  if (!isBlankOrZeroDate(postDate)) {
    const iso = parisNaiveToUtcIso(postDate as string);
    if (iso) return iso;
  }
  throw new Error("date de commande illisible (post_date/post_date_gmt)");
}

/**
 * `paidAt` : `_date_paid` (epoch secondes) → ISO ; sinon `_paid_date`
 * (datetime Paris) → ISO ; sinon si le statut CIBLE ∈ {paid, prepared,
 * shipped, refunded} → `createdAt` ; sinon `null`.
 */
export function computePaidAt(
  datePaidEpochSeconds: string | null,
  paidDateParis: string | null,
  status: OrderStatus,
  createdAtIso: string,
): string | null {
  const epoch = (datePaidEpochSeconds ?? "").trim();
  if (epoch !== "") {
    const n = Number(epoch);
    if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString();
  }
  if (!isBlankOrZeroDate(paidDateParis)) {
    const iso = parisNaiveToUtcIso(paidDateParis as string);
    if (iso) return iso;
  }
  if (PAID_LIKE_STATUSES.has(status)) return createdAtIso;
  return null;
}

/** `post_date` (naïf Paris) ≥ 2026-08-19 — comparaison lexicographique sûre sur `YYYY-MM-DD HH:MM:SS` largeur fixe. */
export function isPostBascule(postDate: string | null): boolean {
  const v = (postDate ?? "").trim();
  return v !== "" && v >= "2026-08-19 00:00:00";
}

/* ─────────────────────────── Nombres ─────────────────────────── */

/** `_order_total`/`_order_shipping`/`_cart_discount`/`_line_subtotal` : chaîne décimale Woo (point, jamais de virgule observée dans le dump) ; vide/absent → 0 (défaut explicite de la spec pour les champs concernés). */
export function parseWooDecimal(value: string | null | undefined): number {
  const v = (value ?? "").trim();
  if (v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** `Σ_line_subtotal − discount + shipping − total` ; tolérance 0,02 € (arrondis en cascade). */
export function checkArithmeticMismatch(
  sumLineSubtotals: number,
  discountTTC: number,
  shippingCostTTC: number,
  totalTTC: number,
): boolean {
  return Math.abs(sumLineSubtotals - discountTTC + shippingCostTTC - totalTTC) > 0.02;
}

/* ─────────────────────────── Texte : HTML/entités/titres ───────────────────────────
 *
 * Pas de dépendance à `sanitize-html`/`src/lib/cms-html.ts` ici (le rendu web
 * n'est pas concerné, seul un texte nu snapshotté l'est) — plus proche dans
 * l'esprit de `cmsExcerpt` (même fichier), en autonome : ce module ne doit
 * dépendre que de `src/lib/types.ts` (contrat imports relatifs uniquement,
 * `payload run` sans alias `@/*` fiable).
 */

/** Entités HTML rencontrées dans le dump (WordPress/WooCommerce) — liste fermée, pas une lib d'entités générique. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  times: "×",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  icirc: "î",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/**
 * Nettoie un `order_item_name`/titre produit brut : balises HTML → espaces,
 * entités décodées, espaces effondrés, trim. Cas obligatoire de la mission :
 * `Friedrich Engels<br><i>Les Principes du communisme</i>` →
 * `Friedrich Engels Les Principes du communisme`.
 */
export function cleanLineTitle(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Marqueur commercial WooCommerce, jamais un mot du vrai titre éditorial —
 * un seul produit du dump le porte (id 7870, "PRÉCOMMANDE --<i>L’État et la
 * révolution citoyenne </i>") mais la règle est générique : n'importe quel
 * futur produit "PRÉCOMMANDE — <titre>" doit s'apparier sur le titre réel,
 * pas échouer parce que le préfixe marketing ne figure pas sur la fiche
 * catalogue.
 */
const PRECOMMANDE_PREFIX_RE = /^PRECOMMANDE\s*[-:–—]*\s*/;

/**
 * Titre normalisé pour appariement (buckets `titre`/`titre-ligne`) : nettoyage
 * HTML/entités (`cleanLineTitle`), diacritiques retirés (NFD + suppression
 * des marques combinantes), préfixe « PRÉCOMMANDE » retiré, casse et
 * ponctuation aplaties en un seul espace.
 */
export function normalizeTitle(raw: string): string {
  const clean = cleanLineTitle(raw);
  const ascii = clean
    .normalize("NFD")
    // Marques diacritiques combinantes (U+0300–U+036F) — écrit en échappement
    // explicite plutôt qu'en caractères bruts dans la regex (ambigus/invisibles
    // en source, cf. NFD ci-dessus qui les a précisément isolées).
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const withoutPrefix = ascii.replace(PRECOMMANDE_PREFIX_RE, "");
  return withoutPrefix
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/* ─────────────────────────── E-mail ───────────────────────────
 *
 * Regex copiée VERBATIM de `node_modules/payload/dist/fields/validations.js`
 * (validateur `email` du champ `type: 'email'`, appliqué à `Orders.email`
 * malgré `overrideAccess: true` — vérifié : la validation de champ n'est pas
 * une policy d'accès, elle s'applique toujours). Toute dérive de version de
 * `payload` doit être revérifiée contre ce fichier.
 */
const PAYLOAD_EMAIL_REGEX =
  /^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

/** TLD connus pour l'extraction ancrée de repli — liste fermée (spec figée), pas une liste IANA complète. */
const KNOWN_TLDS = "com|fr|net|org|be|ch|de|it|eu|edu|uk";
const EMAIL_EXTRACTION_RE = new RegExp(`[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)*?\\.(?:${KNOWN_TLDS})`, "i");

export interface EmailRepairResult {
  email: string;
  repaired: boolean;
  method: "extraction" | "fallback" | null;
}

/**
 * `email` = `_billing_email` trim + minuscules. Si invalide au sens du
 * validateur Payload : réparation par extraction ancrée sur TLD connus (cas
 * obligatoire : `gillestanguy0856@gmail.comGt31081956` →
 * `gillestanguy0856@gmail.com`, id 6553/6554 du dump) ; sinon repli
 * `legacy-<ID>@archive.ld-es.fr`.
 */
export function repairEmail(raw: string | null | undefined, wooId: number): EmailRepairResult {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized !== "" && PAYLOAD_EMAIL_REGEX.test(normalized)) {
    return { email: normalized, repaired: false, method: null };
  }
  const match = EMAIL_EXTRACTION_RE.exec(normalized);
  if (match && PAYLOAD_EMAIL_REGEX.test(match[0])) {
    return { email: match[0], repaired: true, method: "extraction" };
  }
  return { email: `legacy-${wooId}@archive.ld-es.fr`, repaired: true, method: "fallback" };
}

/* ─────────────────────────── Adresses ───────────────────────────
 *
 * Spec (figée) : billing depuis `_billing_*` ; shipping depuis `_shipping_*`
 * avec repli CHAMP PAR CHAMP sur billing (193 commandes du dump sans aucune
 * adresse shipping → billing intégral, cas général de ce repli champ par
 * champ). `fullName` = 'first last' trim, sinon '—'. `line1`/`postal`/`city`
 * requis → repli billing puis '—'. `country` : FR/BE/CH tels quels ; autre
 * valeur (cas réel unique du dump : commande #192, IT) → 'FR' + suffixe
 * ' [<code>]' sur `addressLine2` ; `shipping country` vide → billing
 * (`country` RÉSOLU de billing, pas la valeur brute).
 */

export interface WooAddressRaw {
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
}

function nonEmpty(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

interface CountryResolution {
  code: OrderCountry;
  /** Code source si repli forcé sur FR (autre qu'une valeur vide) — `null` sinon. */
  invalidCode: string | null;
}

const VALID_COUNTRIES: ReadonlySet<string> = new Set(["FR", "BE", "CH"]);

function resolveCountryCode(raw: string | null): CountryResolution {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "") return { code: "FR", invalidCode: null };
  if (VALID_COUNTRIES.has(v)) return { code: v as OrderCountry, invalidCode: null };
  return { code: "FR", invalidCode: v };
}

function appendCountrySuffix(base: string | null, invalidCode: string | null): string | undefined {
  if (invalidCode == null) return base ?? undefined;
  const suffix = `[${invalidCode}]`;
  return base ? `${base} ${suffix}` : suffix;
}

export interface CountryRepair {
  scope: "billing" | "shipping";
  code: string;
}

export interface ResolvedAddresses {
  billingAddress: OrderAddress;
  shippingAddress: OrderAddress;
  countryRepairs: CountryRepair[];
}

export function resolveAddresses(billing: WooAddressRaw, shipping: WooAddressRaw): ResolvedAddresses {
  const countryRepairs: CountryRepair[] = [];

  const billingCountry = resolveCountryCode(billing.country);
  if (billingCountry.invalidCode) countryRepairs.push({ scope: "billing", code: billingCountry.invalidCode });

  // Base `addressLine2` SANS le suffixe pays — le repli shipping→billing (ligne
  // suivante) doit porter sur cette base neutre, jamais sur la valeur déjà
  // suffixée de billing (sans quoi un pays invalide partagé par les deux
  // adresses empilerait deux fois le même suffixe, cf. test « #192 »).
  const billingAddressLine2Base = nonEmpty(billing.address2);
  const billingFullName = nonEmpty(`${billing.firstName ?? ""} ${billing.lastName ?? ""}`.trim());
  const billingAddress: OrderAddress = {
    fullName: billingFullName ?? "—",
    addressLine1: nonEmpty(billing.address1) ?? "—",
    addressLine2: appendCountrySuffix(billingAddressLine2Base, billingCountry.invalidCode),
    postalCode: nonEmpty(billing.postcode) ?? "—",
    city: nonEmpty(billing.city) ?? "—",
    country: billingCountry.code,
  };

  const shippingCountryRaw = nonEmpty(shipping.country);
  let shippingCountryCode: OrderCountry;
  let shippingInvalidCode: string | null = null;
  if (shippingCountryRaw == null) {
    // « shipping country vide → billing » : reprend le code DÉJÀ RÉSOLU de billing.
    shippingCountryCode = billingAddress.country;
  } else {
    const resolved = resolveCountryCode(shippingCountryRaw);
    shippingCountryCode = resolved.code;
    shippingInvalidCode = resolved.invalidCode;
    if (resolved.invalidCode) countryRepairs.push({ scope: "shipping", code: resolved.invalidCode });
  }

  const shippingFullName = nonEmpty(`${shipping.firstName ?? ""} ${shipping.lastName ?? ""}`.trim());
  // Ligne 2 : repli billing seulement si la livraison n'a pas sa propre
  // adresse (line1 vide → tout vient de billing) ou si c'est la MÊME adresse
  // (line1 identique, ligne 2 qui la complète) — jamais greffer le complément
  // de facturation sur une adresse de livraison différente (dump final : 55
  // commandes concernées, 54 même adresse, 1 seule divergente — #159, 2018).
  const shippingLine1Raw = nonEmpty(shipping.address1);
  const sameAddressAsBilling = shippingLine1Raw == null || shippingLine1Raw === nonEmpty(billing.address1);
  const shippingAddressLine2Base = nonEmpty(shipping.address2) ?? (sameAddressAsBilling ? billingAddressLine2Base : null);
  const shippingAddress: OrderAddress = {
    fullName: shippingFullName ?? billingAddress.fullName,
    addressLine1: nonEmpty(shipping.address1) ?? billingAddress.addressLine1,
    addressLine2: appendCountrySuffix(shippingAddressLine2Base, shippingInvalidCode),
    postalCode: nonEmpty(shipping.postcode) ?? billingAddress.postalCode,
    city: nonEmpty(shipping.city) ?? billingAddress.city,
    country: shippingCountryCode,
  };

  return { billingAddress, shippingAddress, countryRepairs };
}

/* ─────────────────────────── Méthode de port ───────────────────────────
 *
 * Spec (figée) : pas de ligne shipping OU coût 0 → 'offert' ; libellé
 * contenant 'manifeste' → 'reduit' ; sinon 'standard'.
 */
export function computeShippingMethod(shippingLabel: string | null, shippingCostTTC: number): OrderShippingMethod {
  if (shippingLabel == null || shippingCostTTC === 0) return "offert";
  if (shippingLabel.toLowerCase().includes("manifeste")) return "reduit";
  return "standard";
}

/* ─────────────────────────── Appariement produit → books ───────────────────────────
 *
 * Chaîne (spec figée) par `_product_id` :
 *   1) produit existant → `entries[slug] ?? entries[String(ID)]`
 *      (`redirects-produits.json`) → books (edition+slug puis slug seul)
 *      [bucket 'redirects'] ;
 *   2) sinon books par slug identique (au `post_name` du produit), puis TITRE
 *      NORMALISÉ (du `post_title` produit) [buckets 'slug-direct'/'titre'] ;
 *   3) produit supprimé (pas de post `product` pour cet id) → titre normalisé
 *      de `order_item_name` vs `books.title` [bucket 'titre-ligne'] ;
 *   4) échec → fiche de repli [bucket 'repli'].
 *
 * Un candidat multiple (plusieurs fiches pour le même slug/titre normalisé)
 * n'est PAS choisi arbitrairement : c'est une ambiguïté, on retombe sur
 * l'étape suivante de la chaîne (documenté — la spec ne tranche pas ce cas,
 * choix pris ici : mieux vaut retomber en 'repli' listé au rapport qu'un
 * mauvais livre crédité).
 */

export interface WooProductRef {
  id: number;
  /** `post_name` du produit Woo. */
  slug: string;
  /** `post_title` brut (peut contenir du HTML/entités). */
  title: string;
}

export interface BookIndexEntry {
  id: number;
  slug: string;
  edition: EditionSlug | null;
  isbn: string | null;
  title: string;
  origin: "catalogue" | "boutique";
}

export type ProductMatchBucket = "redirects" | "slug-direct" | "titre" | "titre-ligne" | "repli";

export interface ProductMatchResult {
  bucket: ProductMatchBucket;
  book: BookIndexEntry | null;
}

export interface RedirectEntry {
  edition: EditionSlug | null;
  slug: string;
}

export interface ProductMatchIndex {
  wooProducts: Map<number, WooProductRef>;
  redirectEntries: Record<string, RedirectEntry>;
  booksById: Map<number, BookIndexEntry>;
  booksByEditionSlug: Map<string, BookIndexEntry>;
  booksBySlugGlobal: Map<string, BookIndexEntry[]>;
  booksByNormalizedTitle: Map<string, BookIndexEntry[]>;
}

function bookKey(edition: EditionSlug | null, slug: string): string {
  return `${edition ?? "∅"}:${slug}`;
}

export function buildProductMatchIndex(
  wooProducts: WooProductRef[],
  redirectEntries: Record<string, RedirectEntry>,
  books: BookIndexEntry[],
): ProductMatchIndex {
  const booksById = new Map<number, BookIndexEntry>();
  const booksByEditionSlug = new Map<string, BookIndexEntry>();
  const booksBySlugGlobal = new Map<string, BookIndexEntry[]>();
  const booksByNormalizedTitle = new Map<string, BookIndexEntry[]>();

  for (const book of books) {
    booksById.set(book.id, book);
    booksByEditionSlug.set(bookKey(book.edition, book.slug), book);
    const bySlug = booksBySlugGlobal.get(book.slug) ?? [];
    bySlug.push(book);
    booksBySlugGlobal.set(book.slug, bySlug);
    const normTitle = normalizeTitle(book.title);
    const byTitle = booksByNormalizedTitle.get(normTitle) ?? [];
    byTitle.push(book);
    booksByNormalizedTitle.set(normTitle, byTitle);
  }

  return {
    wooProducts: new Map(wooProducts.map((p) => [p.id, p])),
    redirectEntries,
    booksById,
    booksByEditionSlug,
    booksBySlugGlobal,
    booksByNormalizedTitle,
  };
}

function resolveRedirectBook(entry: RedirectEntry, index: ProductMatchIndex): BookIndexEntry | null {
  const byEditionSlug = index.booksByEditionSlug.get(bookKey(entry.edition, entry.slug));
  if (byEditionSlug) return byEditionSlug;
  // « edition+slug puis slug seul » : repli sur une correspondance de slug
  // univoque, quelle que soit l'édition portée par l'entrée (une entrée de
  // redirection peut être plus ancienne qu'un changement d'édition de fiche).
  const bySlug = index.booksBySlugGlobal.get(entry.slug) ?? [];
  return bySlug.length === 1 ? bySlug[0] : null;
}

export function matchProduct(productId: number, orderItemName: string, index: ProductMatchIndex): ProductMatchResult {
  const product = index.wooProducts.get(productId);

  if (product) {
    const entry = index.redirectEntries[product.slug] ?? index.redirectEntries[String(productId)];
    if (entry) {
      const book = resolveRedirectBook(entry, index);
      if (book) return { bucket: "redirects", book };
    }

    const slugCandidates = index.booksBySlugGlobal.get(product.slug) ?? [];
    if (slugCandidates.length === 1) {
      return { bucket: "slug-direct", book: slugCandidates[0] };
    }

    const titleCandidates = index.booksByNormalizedTitle.get(normalizeTitle(product.title)) ?? [];
    if (titleCandidates.length === 1) {
      return { bucket: "titre", book: titleCandidates[0] };
    }
  } else {
    const titleCandidates = index.booksByNormalizedTitle.get(normalizeTitle(orderItemName)) ?? [];
    if (titleCandidates.length === 1) {
      return { bucket: "titre-ligne", book: titleCandidates[0] };
    }
  }

  return { bucket: "repli", book: null };
}

/** Produit Woo dont chaque commande DOIT résoudre vers la vraie fiche « L'État et la révolution citoyenne » (PR #100) — jamais un repli (369 commandes concernées). */
export const PRECOMMANDE_PRODUCT_ID = 7870;

/**
 * Résout la fiche réelle du produit précommande obligatoire — jette
 * explicitement si l'appariement échoue (repli ou produit absent de l'index).
 * L'appelant (`scripts/import-orders-woo.ts`) doit interrompre le script
 * ENTIER sur cette exception, dry-run comme commit : aucune des 369
 * commandes concernées ne doit jamais être créée avec la fiche de repli.
 */
export function resolvePrecommandeBook(index: ProductMatchIndex): BookIndexEntry {
  const result = matchProduct(PRECOMMANDE_PRODUCT_ID, "", index);
  if (!result.book) {
    throw new Error(
      `[import-orders-woo] ABORT — produit ${PRECOMMANDE_PRODUCT_ID} (« L'État et la révolution citoyenne ») ` +
        "introuvable/non apparié en base Payload : 369 commandes de précommande ne peuvent pas être importées " +
        "sans repli (interdit pour ce produit). Vérifier que la fiche existe (catalogue) et que son titre " +
        "normalisé correspond au produit Woo #7870.",
    );
  }
  return result.book;
}

/* ─────────────────────────── Lignes de commande ─────────────────────────── */

export interface WooLineItemInput {
  orderItemId: number;
  productId: number;
  /** `order_item_name` brut (HTML/entités non nettoyés). */
  orderItemName: string;
  /** `_qty` brut. */
  qty: string | null;
  /** `_line_subtotal` brut. */
  lineSubtotal: string | null;
}

export interface ProductLineBucket {
  productId: number;
  bucket: ProductMatchBucket;
  bookId: number | null;
}

export interface LineBuildResult {
  lines: OrderLineData[];
  qtyAnomalies: { orderItemId: number; productId: number }[];
  productBuckets: ProductLineBucket[];
}

/**
 * `quantity` = `_qty` (0/vide → 1 + anomalie) ; `unitPriceTTC` =
 * `round(_line_subtotal/qty, 2)` ; `titleSnapshot` = `order_item_name`
 * nettoyé ; `isbnSnapshot` = isbn de la fiche appariée sinon `null` ; `book`
 * = résolution de la chaîne d'appariement (repli → `fallbackBookId`, fourni
 * par l'orchestrateur : soit la fiche de repli existante, soit son id créé
 * en `--commit`, soit un sentinel en dry-run).
 */
export function buildOrderLines(
  wooLines: WooLineItemInput[],
  index: ProductMatchIndex,
  fallbackBookId: number,
): LineBuildResult {
  const lines: OrderLineData[] = [];
  const qtyAnomalies: LineBuildResult["qtyAnomalies"] = [];
  const productBuckets: ProductLineBucket[] = [];

  for (const wl of wooLines) {
    const match = matchProduct(wl.productId, wl.orderItemName, index);
    const bookId = match.book?.id ?? fallbackBookId;

    const qtyRaw = (wl.qty ?? "").trim();
    let qty = parseInt(qtyRaw, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      qty = 1;
      qtyAnomalies.push({ orderItemId: wl.orderItemId, productId: wl.productId });
    }

    const subtotal = parseWooDecimal(wl.lineSubtotal);
    lines.push({
      book: bookId,
      titleSnapshot: cleanLineTitle(wl.orderItemName),
      isbnSnapshot: match.book?.isbn ?? null,
      quantity: qty,
      unitPriceTTC: round2(subtotal / qty),
    });

    productBuckets.push({ productId: wl.productId, bucket: match.bucket, bookId: match.book?.id ?? null });
  }

  return { lines, qtyAnomalies, productBuckets };
}

/* ─────────────────────────── Type de commande ─────────────────────────── */

export interface OrderTypeResult {
  orderType: OrderKind;
  /** Panier mixte : au moins une ligne précommande (7870) ET au moins une ligne autre. */
  mixed: boolean;
}

export function computeOrderType(productIds: number[]): OrderTypeResult {
  const hasPrecommande = productIds.includes(PRECOMMANDE_PRODUCT_ID);
  const hasOther = productIds.some((id) => id !== PRECOMMANDE_PRODUCT_ID);
  return { orderType: hasPrecommande ? "precommande" : "commande", mixed: hasPrecommande && hasOther };
}

/* ─────────────────────────── Commande complète ─────────────────────────── */

export interface WooOrderInput {
  id: number;
  postStatus: string;
  /** Naïf, heure locale Europe/Paris (colonne `post_date`). */
  postDate: string | null;
  /** Naïf, UTC (colonne `post_date_gmt`). */
  postDateGmt: string | null;
  billing: WooAddressRaw;
  shipping: WooAddressRaw;
  billingEmail: string | null;
  /** `_order_shipping`. */
  orderShipping: string | null;
  /** `_cart_discount`. */
  cartDiscount: string | null;
  /** `_order_total`. */
  orderTotal: string | null;
  /** `_date_paid` (epoch secondes, brut). */
  datePaid: string | null;
  /** `_paid_date` (datetime Paris, brut). */
  paidDate: string | null;
  lines: WooLineItemInput[];
  /** Libellé de la ligne `order_item_type='shipping'` — `null` si aucune. */
  shippingLabel: string | null;
}

export interface TransformFlags {
  orderType: OrderKind;
  mixedPrecommande: boolean;
  emailRepaired: boolean;
  emailRepairMethod: EmailRepairResult["method"];
  countryRepairs: CountryRepair[];
  arithmeticMismatch: boolean;
  onHold: boolean;
  onHoldPaid: boolean;
  qtyAnomalies: number;
  postBascule: boolean;
  productBuckets: ProductLineBucket[];
  wooStatus: string;
}

export interface TransformSuccess {
  kind: "ok";
  wooId: number;
  data: OrderCreateWooData;
  flags: TransformFlags;
}

export interface TransformExcluded {
  kind: "excluded";
  wooId: number;
  reason: string;
}

export type TransformResult = TransformSuccess | TransformExcluded;

function hasPaidSignal(datePaid: string | null, paidDate: string | null): boolean {
  const epoch = (datePaid ?? "").trim();
  if (epoch !== "" && Number(epoch) > 0) return true;
  return !isBlankOrZeroDate(paidDate);
}

/**
 * Transforme UNE commande Woo en payload de création `orders` (ou en
 * exclusion motivée). Fonction pure — `index`/`fallbackBookId` sont
 * calculés une fois par l'orchestrateur et réutilisés pour tout le run.
 */
export function transformOrder(
  order: WooOrderInput,
  index: ProductMatchIndex,
  fallbackBookId: number,
): TransformResult {
  const paidSignal = hasPaidSignal(order.datePaid, order.paidDate);
  const status = mapWooStatus(order.postStatus, paidSignal);
  if (status == null) {
    return { kind: "excluded", wooId: order.id, reason: `statut Woo inattendu : ${order.postStatus}` };
  }

  let createdAtIso: string;
  try {
    createdAtIso = computeCreatedAt(order.postDateGmt, order.postDate);
  } catch {
    return { kind: "excluded", wooId: order.id, reason: "date de commande illisible (post_date/post_date_gmt)" };
  }

  const paidAtIso = computePaidAt(order.datePaid, order.paidDate, status, createdAtIso);
  const emailResult = repairEmail(order.billingEmail, order.id);
  const { billingAddress, shippingAddress, countryRepairs } = resolveAddresses(order.billing, order.shipping);
  const { lines, qtyAnomalies, productBuckets } = buildOrderLines(order.lines, index, fallbackBookId);
  const { orderType, mixed } = computeOrderType(order.lines.map((l) => l.productId));

  const shippingCostTTC = parseWooDecimal(order.orderShipping);
  const discountTTC = parseWooDecimal(order.cartDiscount);
  const totalTTC = parseWooDecimal(order.orderTotal);
  const sumSubtotals = order.lines.reduce((s, l) => s + parseWooDecimal(l.lineSubtotal), 0);
  const arithmeticMismatch = checkArithmeticMismatch(sumSubtotals, discountTTC, shippingCostTTC, totalTTC);
  const shippingMethod = computeShippingMethod(order.shippingLabel, shippingCostTTC);

  const data: OrderCreateWooData = {
    number: String(order.id),
    orderType,
    status,
    email: emailResult.email,
    shippingAddress,
    billingAddress,
    lines,
    shippingMethod,
    shippingCostTTC,
    discountTTC,
    totalTTC,
    stripeSessionId: `woo-${order.id}`,
    stripePaymentIntentId: null,
    paidAt: paidAtIso,
    stockDecremented: true,
    confirmationSent: true,
    createdAt: createdAtIso,
  };

  return {
    kind: "ok",
    wooId: order.id,
    data,
    flags: {
      orderType,
      mixedPrecommande: mixed,
      emailRepaired: emailResult.repaired,
      emailRepairMethod: emailResult.method,
      countryRepairs,
      arithmeticMismatch,
      onHold: order.postStatus === "wc-on-hold",
      onHoldPaid: order.postStatus === "wc-on-hold" && status === "paid",
      qtyAnomalies: qtyAnomalies.length,
      postBascule: isPostBascule(order.postDate),
      productBuckets,
      wooStatus: order.postStatus,
    },
  };
}

/* ─────────────────────────── Idempotence ─────────────────────────── */

/** `stripeSessionId = 'woo-' + <ID Woo>` — clé d'idempotence de l'import (import-orders-woo.ts:findExistingWooOrderIds). */
export function wooStripeSessionId(wooId: number): string {
  return `woo-${wooId}`;
}

export function isAlreadyImported(wooId: number, existingWooIds: ReadonlySet<number>): boolean {
  return existingWooIds.has(wooId);
}

/* ─────────────────────────── Rapport : mapping produit ─────────────────────────── */

export interface ProductMappingRow {
  productId: number;
  productTitle: string | null;
  bucket: ProductMatchBucket;
  bookId: number | null;
  bookSlug: string | null;
  lineCount: number;
}

/**
 * Une ligne par (produit, bucket, fiche cible) — agrège `nb lignes` sur
 * l'ensemble des commandes du run. `productTitle` vient de l'index Woo
 * (`null` si le produit a été supprimé, bucket `titre-ligne`).
 */
export function buildProductMappingReport(
  allProductBuckets: ProductLineBucket[],
  index: ProductMatchIndex,
): ProductMappingRow[] {
  const grouped = new Map<string, ProductMappingRow>();
  for (const pb of allProductBuckets) {
    const key = `${pb.productId}:${pb.bucket}:${pb.bookId ?? "∅"}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.lineCount += 1;
      continue;
    }
    const product = index.wooProducts.get(pb.productId);
    const book = pb.bookId != null ? index.booksById.get(pb.bookId) : undefined;
    grouped.set(key, {
      productId: pb.productId,
      productTitle: product ? cleanLineTitle(product.title) : null,
      bucket: pb.bucket,
      bookId: pb.bookId,
      bookSlug: book?.slug ?? null,
      lineCount: 1,
    });
  }
  return [...grouped.values()].sort((a, b) => a.productId - b.productId || a.bucket.localeCompare(b.bucket));
}

/* ─────────────────────────── Rapport : agrégats globaux ─────────────────────────── */

export interface ImportReportTotals {
  totalOrders: number;
  created: number;
  excluded: number;
  byStatus: Record<string, number>;
  byOrderType: Record<OrderKind, number>;
  sumTotalTTCByStatus: Record<string, number>;
  emailRepairs: { wooId: number; method: EmailRepairResult["method"] }[];
  countryRepairs: { wooId: number; scope: "billing" | "shipping"; code: string }[];
  arithmeticMismatches: number[];
  onHoldCases: { wooId: number; resultStatus: OrderStatus }[];
  mixedPrecommandeOrders: number[];
  postBasculeOrders: number[];
  exclusions: { wooId: number; reason: string }[];
  qtyAnomalyOrders: number;
}

/** Agrège les résultats de `transformOrder` sur tout le run — pure, mêmes données que le rapport JSON/Markdown de l'orchestrateur. */
export function aggregateImportReport(results: TransformResult[]): ImportReportTotals {
  const totals: ImportReportTotals = {
    totalOrders: results.length,
    created: 0,
    excluded: 0,
    byStatus: {},
    byOrderType: { commande: 0, precommande: 0 },
    sumTotalTTCByStatus: {},
    emailRepairs: [],
    countryRepairs: [],
    arithmeticMismatches: [],
    onHoldCases: [],
    mixedPrecommandeOrders: [],
    postBasculeOrders: [],
    exclusions: [],
    qtyAnomalyOrders: 0,
  };

  for (const r of results) {
    if (r.kind === "excluded") {
      totals.excluded += 1;
      totals.exclusions.push({ wooId: r.wooId, reason: r.reason });
      continue;
    }
    totals.created += 1;
    totals.byStatus[r.data.status] = (totals.byStatus[r.data.status] ?? 0) + 1;
    totals.byOrderType[r.data.orderType] += 1;
    totals.sumTotalTTCByStatus[r.data.status] = round2(
      (totals.sumTotalTTCByStatus[r.data.status] ?? 0) + r.data.totalTTC,
    );
    if (r.flags.emailRepaired) totals.emailRepairs.push({ wooId: r.wooId, method: r.flags.emailRepairMethod });
    for (const cr of r.flags.countryRepairs) totals.countryRepairs.push({ wooId: r.wooId, ...cr });
    if (r.flags.arithmeticMismatch) totals.arithmeticMismatches.push(r.wooId);
    if (r.flags.onHold) totals.onHoldCases.push({ wooId: r.wooId, resultStatus: r.data.status });
    if (r.flags.mixedPrecommande) totals.mixedPrecommandeOrders.push(r.wooId);
    if (r.flags.postBascule) totals.postBasculeOrders.push(r.wooId);
    if (r.flags.qtyAnomalies > 0) totals.qtyAnomalyOrders += 1;
  }

  return totals;
}
