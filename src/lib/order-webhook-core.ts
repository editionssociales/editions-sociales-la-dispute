/**
 * Cœur pur de l'assemblage d'une commande depuis les faits extraits d'une
 * session Stripe (webhook, plan §4 étape 9) — ne touche ni Payload ni Stripe :
 * l'appelant (`api/stripe/webhook/order-handler.ts`) extrait les champs bruts
 * de l'objet Stripe (déjà de simples valeurs JSON) et joint les lignes
 * décodées (`checkout-core.ts:decodeCheckoutLines`) au titre/ISBN/stock relus
 * fraîchement (`commerce-source.ts`) — ce module ne fait que la validation
 * minimale (email/adresse/lignes présents) + la mise en forme vers le shape
 * `payload.create({collection:'orders'})`, symétrique de `checkout-core.ts`
 * côté création de session.
 */
import type { ShippingMethodLabel } from "./cart-quote";
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
