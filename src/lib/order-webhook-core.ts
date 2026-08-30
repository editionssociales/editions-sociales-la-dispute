/**
 * Cœur pur de l'assemblage d'une commande depuis les faits extraits d'une
 * session Stripe (webhook, plan §4 étape 9) — ne touche ni Payload ni Stripe :
 * l'appelant (`api/stripe/webhook/order-handler.ts`) extrait les champs bruts
 * de l'objet Stripe (déjà de simples valeurs JSON) et joint les lignes
 * décodées (`checkout-core.ts:decodeCheckoutLines`) au titre/ISBN/stock relus
 * fraîchement (`commerce-source.ts`) — ce module fait la validation
 * minimale (email/adresse/lignes présents), la mise en forme vers le shape
 * `payload.create({collection:'orders'})` (symétrique de `checkout-core.ts`
 * côté création de session) ET les petites conversions champ-à-champ
 * (pays, centimes de metadata, adresse) que l'appelant gardait privées
 * avant le refactor. Les types `Stripe.*`/`Order` n'apparaissent qu'en
 * `import type`, effacés à la compilation — aucun SDK ni Payload chargé.
 */
import type Stripe from "stripe";
import type { Order } from "@/payload-types";
import type { ShippingMethodLabel } from "./cart-quote";
import type { DecodedCheckoutLine } from "./checkout-core";
import type { DonationMailRecapAddress } from "./donation-mail";
import { centsToEuros } from "./money";

/** Ventes restreintes FR/BE/CH (`Orders.ts:shippingAddress.country`, même contrainte que `shipping_address_collection`). */
export type OrderCountry = "FR" | "BE" | "CH";

/**
 * Type de commande (`Orders.ts:orderType`, client 2026-08-20) — un panier
 * mixte produit UNE commande de chaque type, même session/paiement Stripe.
 * `"don"` (client 2026-08-21, contreparties) : expédition d'une contrepartie
 * de palier, étanche des deux autres types (aucun agrégat de CA/TVA).
 */
export type OrderKind = "commande" | "precommande" | "don";

export interface OrderAddressFacts {
  fullName: string;
  addressLine1: string;
  addressLine2?: string | null;
  postalCode: string;
  city: string;
  country: OrderCountry;
}

export interface OrderLineFacts {
  bookId: number;
  titleSnapshot: string;
  isbnSnapshot: string | null;
  quantity: number;
  /** Centimes — dérivés des `metadata` posées par `/api/checkout` (prix déjà re-validé serveur), jamais recalculés ici. */
  unitPriceCents: number;
}

/** Alias du port — même étiquette que `ShippingMethodLabel` (`cart-quote.ts`), sous le nom attendu par ses consommateurs (`order-handler.ts`). */
export type OrderShippingMethod = ShippingMethodLabel;

export interface OrderSessionFacts {
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  email: string | null;
  /** Téléphone collecté par Stripe Checkout (`phone_number_collection`, client 2026-08-24) — `null` tant qu'une passerelle ne le fournit pas (dons, historique). Jamais bloquant : une commande sans téléphone reste une commande. */
  phone: string | null;
  shippingAddress: OrderAddressFacts | null;
  lines: OrderLineFacts[];
  /** Commande normale ou précommande — cette partie DE la scission (client 2026-08-20), jamais les deux à la fois (`buildOrderCreateData` assemble UNE commande par appel). */
  orderType: OrderKind;
  shippingMethod: OrderShippingMethod;
  /**
   * Centimes — le tarif d'UN SEUL envoi (`cart-quote.ts`, `metadata.shippingCostCents`
   * posée par le checkout), appliqué TEL QUEL à cette commande : la
   * multiplication par le nombre d'envois est un fait du PANIER combiné
   * (une commande ne connaît que SON propre envoi), jamais rejouée ici.
   */
  shippingCostCents: number;
  /** Centimes — part de la remise combinée déjà allouée à CETTE partie (`cart-quote.ts`), jamais recalculée ici. */
  discountCents: number;
  promoCodeId: number | null;
  /**
   * Centimes — pour une session à commande UNIQUE (comportement historique),
   * `amount_total` Stripe fait foi (vérité du montant réellement encaissé).
   * Pour une session SCINDÉE, Stripe n'expose qu'un montant total combiné :
   * `totalCents` de CETTE partie est alors une composition arithmétique pure
   * de faits déjà validés au checkout (lignes/port/remise déjà crédités,
   * jamais un prix ou une règle de vendabilité redérivés) — cf.
   * `computePartTotalCents`, appelée par l'appelant (`order-handler.ts`)
   * quand la session porte plus d'une partie.
   */
  totalCents: number;
  paidAtISO: string;
}

export interface OrderAssemblyError {
  error: string;
}

export interface OrderCreateData {
  status: "paid" | "failed";
  orderType: OrderKind;
  email: string;
  phone: string | null;
  shippingAddress: OrderAddressFacts;
  billingAddress: OrderAddressFacts;
  lines: {
    book: number;
    titleSnapshot: string;
    isbnSnapshot: string | null;
    quantity: number;
    unitPriceTTC: number;
  }[];
  shippingMethod: OrderShippingMethod;
  shippingCostTTC: number;
  promoCode: number | null;
  discountTTC: number;
  totalTTC: number;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  paidAt: string;
  /**
   * Marqueurs d'effet (#64) — TOUJOURS `false` à la création : la commande est
   * enregistrée AVANT que le stock soit décrémenté et l'e-mail envoyé. C'est
   * `createPaidOrder` qui les passe à `true`, un par un, après chaque effet
   * réussi ; un rejeu Stripe reprend là où le précédent s'est arrêté.
   */
  stockDecremented: boolean;
  confirmationSent: boolean;
}

const ORDER_COUNTRIES: readonly OrderCountry[] = ["FR", "BE", "CH"];

/** Restreint un code pays Stripe à l'ensemble vendu — `shipping_address_collection` ne devrait jamais renvoyer autre chose, repli défensif sur FR sinon. */
export function toOrderCountry(country: string | null): OrderCountry {
  return (ORDER_COUNTRIES as readonly string[]).includes(country ?? "")
    ? (country as OrderCountry)
    : "FR";
}

/** Parse un montant en centimes posé en `metadata` Stripe — `0` si absent/non fini (metadata corrompue), jamais `NaN` stocké. */
export function metadataCents(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Parse l'id de code promo posé en `metadata` — `null` si absent/non fini. */
export function metadataPromoCodeId(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Adresse Stripe (`collected_information.shipping_details`) → faits `Orders` — `null` si absente (anomalie sur une session complétée). */
export function addressFromStripe(
  shipping: Stripe.Checkout.Session.CollectedInformation.ShippingDetails | null | undefined,
): OrderAddressFacts | null {
  if (!shipping?.address) return null;
  return {
    fullName: shipping.name,
    addressLine1: shipping.address.line1 ?? "",
    addressLine2: shipping.address.line2 ?? undefined,
    postalCode: shipping.address.postal_code ?? "",
    city: shipping.address.city ?? "",
    country: toOrderCountry(shipping.address.country),
  };
}

/**
 * Assemble les données `Orders` à partir des faits extraits d'une session —
 * refuse (jamais ne jette) si email/adresse/lignes manquent : une session
 * `kind=order` complétée par Stripe doit TOUJOURS les avoir (achat en invité
 * avec adresse de livraison obligatoire) ; leur absence est une anomalie que
 * l'appelant fait remonter en erreur (Sentry), pas une commande à moitié
 * remplie créée en silence.
 */
export function buildOrderCreateData(
  facts: OrderSessionFacts,
  status: "paid" | "failed" = "paid",
): OrderCreateData | OrderAssemblyError {
  if (!facts.email) {
    return { error: `Session Stripe ${facts.stripeSessionId} : email absent.` };
  }
  if (!facts.shippingAddress) {
    return { error: `Session Stripe ${facts.stripeSessionId} : adresse de livraison absente.` };
  }
  if (facts.lines.length === 0) {
    return { error: `Session Stripe ${facts.stripeSessionId} : aucune ligne décodée depuis les metadata.` };
  }

  return {
    status,
    orderType: facts.orderType,
    email: facts.email,
    // Facultatif, contrairement à l'email et à l'adresse : son absence n'a
    // jamais empêché d'expédier une commande, elle ne doit donc pas faire
    // refuser l'assemblage.
    phone: facts.phone,
    shippingAddress: facts.shippingAddress,
    // Dupliquée depuis la livraison : le checkout ne collecte pas d'adresse
    // de facturation distincte (cf. `Orders.ts`, commentaire admin du champ).
    billingAddress: facts.shippingAddress,
    lines: facts.lines.map((l) => ({
      book: l.bookId,
      titleSnapshot: l.titleSnapshot,
      isbnSnapshot: l.isbnSnapshot,
      quantity: l.quantity,
      unitPriceTTC: centsToEuros(l.unitPriceCents),
    })),
    shippingMethod: facts.shippingMethod,
    shippingCostTTC: centsToEuros(facts.shippingCostCents),
    promoCode: facts.promoCodeId,
    discountTTC: centsToEuros(facts.discountCents),
    totalTTC: centsToEuros(facts.totalCents),
    stripeSessionId: facts.stripeSessionId,
    stripePaymentIntentId: facts.stripePaymentIntentId,
    paidAt: facts.paidAtISO,
    // Aucun effet n'a encore eu lieu au moment de la création — y compris pour
    // une commande `failed`, qui n'en déclenchera jamais aucun.
    stockDecremented: false,
    confirmationSent: false,
  };
}

/**
 * Nouveau stock après décrément d'une vente — plancher 0 (jamais négatif),
 * `null` (non suivi) reste `null` (jamais un plancher qui invente un suivi de
 * stock, même règle que `resolveNativePurchase`/`checkout-core.ts`).
 * `allowNegative` (don avec contrepartie, client 2026-08-21) : la
 * contrepartie est TOUJOURS servie, même après réassort — lève le plancher,
 * `null` reste `null` dans tous les cas (le suivi de stock n'est jamais
 * inventé).
 */
export function computeStockAfterDecrement(
  currentStock: number | null,
  qty: number,
  opts?: { allowNegative?: boolean },
): number | null {
  if (currentStock == null) return null;
  if (opts?.allowNegative) return currentStock - qty;
  return Math.max(0, currentStock - qty);
}

/**
 * Total TTC d'UNE partie de commande scindée, en centimes — composition
 * ARITHMÉTIQUE PURE de faits déjà validés/alloués au checkout (prix unitaire
 * re-validé, port au tarif d'un envoi, remise déjà répartie par partie,
 * `cart-quote.ts`) : jamais une règle de vendabilité ou un prix redérivés.
 * Nécessaire UNIQUEMENT pour une session scindée — Stripe n'expose
 * `amount_total` que pour la session ENTIÈRE (un seul paiement), pas par
 * partie ; une session à commande unique continue de faire foi sur
 * `amount_total` (cf. `OrderSessionFacts.totalCents`, appelant).
 *
 * `Math.max(0, …)` avant d'ajouter le port : même garde que
 * `computeCartTotals` (`cart-core.ts`) — la remise allouée à cette partie ne
 * peut normalement pas dépasser son sous-total (`cart-quote.ts` le garantit
 * par construction), ce plancher n'est qu'un filet défensif supplémentaire.
 */
export function computePartTotalCents(
  lines: OrderLineFacts[],
  shippingCostCents: number,
  discountCents: number,
): number {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  return Math.max(0, subtotalCents - discountCents) + shippingCostCents;
}

/* ------------------------------ dons avec contrepartie (client 2026-08-21) ------------------------------ */

/** Faits minimaux d'un article de contrepartie relu en base — sous-ensemble structurel de `ContrepartieBook` (`contreparties.ts`), pour que ce cœur pur ne dépende jamais du lecteur Payload. */
export interface DonationBookFacts {
  title: string;
  isbn: string | null;
}

/**
 * Joint les lignes de contrepartie décodées (`donLines`) au titre/ISBN relus
 * fraîchement — même esprit que `resolveOrderParts` (`order-handler.ts`),
 * MAIS un id introuvable (fiche supprimée entre le checkout et le webhook)
 * n'est JAMAIS omis ici : contrairement au commerce, la contrepartie a été
 * PROMISE au donateur au paiement — la commande doit toujours refléter ce qui
 * est dû, avec un titre de repli plutôt qu'une ligne disparue. Les ids
 * introuvables sont RETOURNÉS (`missingBookIds`) : c'est l'appelant
 * (`order-handler.ts`) qui les signale à Sentry (warning) — jamais bloquant,
 * même découpage que `contreparties.ts` vs `contreparties-core.ts`.
 */
export function resolveDonationLines(
  decoded: DecodedCheckoutLine[],
  books: ReadonlyMap<number, DonationBookFacts>,
): { lines: OrderLineFacts[]; missingBookIds: number[] } {
  const missingBookIds: number[] = [];
  const lines = decoded.map((l) => {
    const book = books.get(l.id);
    if (!book) missingBookIds.push(l.id);
    return {
      bookId: l.id,
      titleSnapshot: book?.title ?? `Article #${l.id}`,
      isbnSnapshot: book?.isbn ?? null,
      quantity: l.qty,
      unitPriceCents: l.unitPriceCents, // toujours 0 — contrat partagé avec la server action de don
    };
  });
  return { lines, missingBookIds };
}

/** `Order.shippingAddress`/`billingAddress` (déjà posées, identiques) → adresse du récap mail — `undefined` seulement si la commande n'en porte aucune (anomalie, ne devrait jamais arriver pour un don : tous les paliers 2026 collectent une adresse). */
export function recapAddressFromOrder(
  order: Pick<Order, "shippingAddress">,
): DonationMailRecapAddress | undefined {
  const a = order.shippingAddress;
  if (!a) return undefined;
  return {
    fullName: a.fullName,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2 ?? undefined,
    postalCode: a.postalCode,
    city: a.city,
    country: a.country,
  };
}
