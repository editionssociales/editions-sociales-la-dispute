/**
 * Cœur pur du checkout (plan §4, phase 4/lot 2, étape 8) — RE-VALIDATION
 * serveur du panier, zéro confiance dans ce que le client envoie (`id`+`qty`
 * uniquement, jamais un prix). Compose avec les modules purs déjà testés :
 * `evaluatePromoCode` (promo-eval-core.ts), `computeShipping`
 * (shipping-core.ts), `computeCartTotals` (cart-core.ts) — ce module n'ajoute
 * que ce qu'aucun des trois autres ne couvre : la validation ligne par ligne
 * (parution, vendabilité, STOCK SUFFISANT — pas seulement `stock > 0` comme
 * `canAddToCart`, cf. `cart-core.ts`) et l'encodage compact des lignes posé en
 * `metadata` Stripe (le webhook, étape 9, le décode pour reconstruire la
 * commande sans jamais refaire confiance à un prix client).
 *
 * Zéro I/O ici : les données livre sont FOURNIES par l'appelant (relues
 * fraîchement depuis Payload par `checkout-source.ts`, jamais depuis le panier
 * client) — même découpage pur/impur que `shipping-core.ts`/`cart-core.ts`.
 */
import { MAX_LINE_QTY } from "./cart-core";
import { isUpcoming } from "./catalogue-core";

/* ------------------------------ requête entrante ------------------------------ */

export interface CheckoutRequestLine {
  id: number;
  qty: number;
}

export interface CheckoutRequest {
  lines: CheckoutRequestLine[];
  zone: string;
  /** `null` = aucun code promo soumis — jamais un refus, juste « pas de remise ». */
  promoCode: string | null;
}

export interface CheckoutRequestError {
  error: string;
}

/**
 * Valide la FORME du corps JSON reçu par `POST /api/checkout` — même esprit
 * défensif que `parseCartState`/`parseDonation` : une entrée malformée est un
 * refus propre (jamais une exception). Tout champ imprévu d'une ligne (un
 * `unitPriceCents` forgé par le client, par ex.) est silencieusement ignoré —
 * seuls `id`/`qty` sont lus, jamais un prix venu du client.
 */
export function parseCheckoutRequest(body: unknown): CheckoutRequest | CheckoutRequestError {
  if (!body || typeof body !== "object") {
    return { error: "Corps de requête invalide." };
  }
  const { lines, zone, promoCode } = body as Record<string, unknown>;

  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "Panier vide." };
  }

  const parsedLines: CheckoutRequestLine[] = [];
  for (const entry of lines) {
    if (!entry || typeof entry !== "object") {
      return { error: "Ligne de panier invalide." };
    }
    const { id, qty } = entry as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      return { error: "Identifiant de ligne invalide." };
    }
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) {
      return { error: "Quantité de ligne invalide." };
    }
    parsedLines.push({ id, qty: Math.min(qty, MAX_LINE_QTY) });
  }

  if (typeof zone !== "string" || zone.trim() === "") {
    return { error: "Zone de livraison manquante." };
  }

  return {
    lines: parsedLines,
    zone,
    promoCode: typeof promoCode === "string" && promoCode.trim() !== "" ? promoCode.trim() : null,
  };
}

/* ------------------------------ validation des lignes ------------------------------ */

/**
 * Ce que le checkout a besoin de savoir d'UN livre — relu fraîchement depuis
 * Payload par l'appelant (`checkout-source.ts`), jamais depuis le panier
 * client. Volontairement plus riche que `CommerceInfo` (`catalogue-source.ts`) :
 * `stock` y est un NOMBRE exploitable (« stock suffisant » compare à la
 * quantité demandée), pas seulement collapsé en statut `available`/`unavailable`.
 */
export interface CheckoutBookLookup {
  title: string;
  isbn: string | null;
  /** Euros — `null` = prix non renseigné (fiche incomplète, ligne refusée). */
  priceEuros: number | null;
  /** ISO `YYYY-MM-DD` — parution future = ligne refusée, même règle que `resolveNativePurchase` (`catalogue-core.ts`). */
  publishedAt: string | null;
  sellable: boolean;
  /** `null` = stock non suivi (illimité) ; sinon plancher STRICT (`stock >= qty`, pas seulement `> 0`). */
  stock: number | null;
  reducedShippingFlag: boolean;
}

export type LineRefusalReason = "not-found" | "not-sellable" | "insufficient-stock" | "no-price";

export interface LineRefusal {
  id: number;
  reason: LineRefusalReason;
  message: string;
}

export interface ValidatedCheckoutLine {
  id: number;
  qty: number;
  titleSnapshot: string;
  isbnSnapshot: string | null;
  unitPriceCents: number;
  lineTotalCents: number;
  reducedShippingFlag: boolean;
}

/** Euros → centimes entiers, arrondi (même règle que `cart-core.ts:priceToCents`). */
function priceToCents(price: number): number {
  return Math.round(price * 100);
}

/**
 * Valide UNE ligne contre le livre fraîchement relu — jamais contre ce que le
 * client prétend. Ordre des règles : introuvable → parution future/non
 * vendable → stock insuffisant → prix manquant (fiche incomplète, ne devrait
 * jamais arriver pour un livre `sellable`, filet de sécurité).
 */
export function validateCheckoutLine(
  input: CheckoutRequestLine,
  book: CheckoutBookLookup | undefined,
  now: Date = new Date(),
): { ok: true; line: ValidatedCheckoutLine } | { ok: false; refusal: LineRefusal } {
  if (!book) {
    return {
      ok: false,
      refusal: { id: input.id, reason: "not-found", message: "Livre introuvable ou dépublié." },
    };
  }
  if (!book.sellable || isUpcoming(book.publishedAt, now)) {
    return {
      ok: false,
      refusal: {
        id: input.id,
        reason: "not-sellable",
        message: `« ${book.title} » n'est plus disponible à la vente.`,
      },
    };
  }
  if (book.stock != null && book.stock < input.qty) {
    return {
      ok: false,
      refusal: {
        id: input.id,
        reason: "insufficient-stock",
        message:
          book.stock <= 0
            ? `« ${book.title} » est épuisé.`
            : `Stock insuffisant pour « ${book.title} » (${book.stock} exemplaire${book.stock > 1 ? "s" : ""} disponible${book.stock > 1 ? "s" : ""}).`,
      },
    };
  }
  if (book.priceEuros == null) {
    return {
      ok: false,
      refusal: { id: input.id, reason: "no-price", message: `Prix non renseigné pour « ${book.title} ».` },
    };
  }
  const unitPriceCents = priceToCents(book.priceEuros);
  return {
    ok: true,
    line: {
      id: input.id,
      qty: input.qty,
      titleSnapshot: book.title,
      isbnSnapshot: book.isbn,
      unitPriceCents,
      lineTotalCents: unitPriceCents * input.qty,
      reducedShippingFlag: book.reducedShippingFlag,
    },
  };
}

export type CheckoutLinesResult =
  | { ok: true; lines: ValidatedCheckoutLine[]; subtotalCents: number; manifestOnly: boolean }
  | { ok: false; refusals: LineRefusal[] };

/**
 * Valide TOUTES les lignes — refuse la totalité de la commande si UNE seule
 * ligne échoue (jamais de commande partielle silencieuse à un montant
 * différent de celui affiché au client : il revient sur `/panier`, dont
 * l'auto-guérison existante — cf. `cart-view.tsx` — traite déjà les lignes
 * devenues indisponibles).
 */
export function validateCheckoutLines(
  inputs: CheckoutRequestLine[],
  books: ReadonlyMap<number, CheckoutBookLookup>,
  now: Date = new Date(),
): CheckoutLinesResult {
  const refusals: LineRefusal[] = [];
  const lines: ValidatedCheckoutLine[] = [];
  for (const input of inputs) {
    const result = validateCheckoutLine(input, books.get(input.id), now);
    if (result.ok) lines.push(result.line);
    else refusals.push(result.refusal);
  }
  if (refusals.length > 0) return { ok: false, refusals };

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const manifestOnly = lines.length > 0 && lines.every((l) => l.reducedShippingFlag);
  return { ok: true, lines, subtotalCents, manifestOnly };
}

/* ------------------------------ méthode de port (snapshot Order) ------------------------------ */

export type ShippingMethodLabel = "standard" | "reduit" | "offert";

/**
 * Étiquette de méthode de port à snapshoter sur la commande (`Orders.ts:shippingMethod`)
 * — dérivée des mêmes règles que `computeShipping` (`shipping-core.ts`), dans
 * l'ordre où ce module les applique (coupon gratuit prime sur « manifeste »).
 */
export function resolveShippingMethod(opts: {
  manifestOnly: boolean;
  freeShippingCoupon: boolean;
}): ShippingMethodLabel {
  if (opts.freeShippingCoupon) return "offert";
  if (opts.manifestOnly) return "reduit";
  return "standard";
}

/* ------------------------------ encodage compact des lignes (metadata Stripe) ------------------------------ */

const LINE_SEP = ";";
const FIELD_SEP = ":";

/**
 * Encode les lignes validées en une chaîne compacte posée en `metadata` de la
 * session Stripe (`id:qty:unitPriceCents;…`) — le webhook (étape 9) la décode
 * pour reconstruire `Orders.lines` sans jamais relire un prix client. Reste
 * sous la limite Stripe de 500 caractères par valeur de metadata pour un
 * panier de taille raisonnable (quelques dizaines de lignes) — un panier
 * anormalement long dépasserait cette borne, hors périmètre d'une boutique de
 * livres (aucune commande réelle observée à ce jour n'en approche).
 */
export function encodeCheckoutLines(lines: ValidatedCheckoutLine[]): string {
  return lines.map((l) => `${l.id}${FIELD_SEP}${l.qty}${FIELD_SEP}${l.unitPriceCents}`).join(LINE_SEP);
}

export interface DecodedCheckoutLine {
  id: number;
  qty: number;
  unitPriceCents: number;
}

/**
 * Décode le format compact — ne jette JAMAIS : un segment malformé (metadata
 * tronquée/corrompue) est ignoré plutôt que de faire échouer tout le webhook,
 * même défensivité que `parseCartState` (`cart-core.ts`).
 */
export function decodeCheckoutLines(raw: string | null | undefined): DecodedCheckoutLine[] {
  if (!raw) return [];
  const lines: DecodedCheckoutLine[] = [];
  for (const chunk of raw.split(LINE_SEP)) {
    if (!chunk) continue;
    const parts = chunk.split(FIELD_SEP);
    if (parts.length !== 3) continue;
    const [id, qty, unitPriceCents] = parts.map(Number);
    if (![id, qty, unitPriceCents].every((n) => Number.isFinite(n))) continue;
    lines.push({ id, qty, unitPriceCents });
  }
  return lines;
}
