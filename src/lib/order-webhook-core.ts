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

/** Ventes restreintes FR/BE/CH (`Orders.ts:shippingAddress.country`, même contrainte que `shipping_address_collection`). */
export type OrderCountry = "FR" | "BE" | "CH";

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

export type OrderShippingMethod = "standard" | "reduit" | "offert";

export interface OrderSessionFacts {
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  email: string | null;
  shippingAddress: OrderAddressFacts | null;
  lines: OrderLineFacts[];
  shippingMethod: OrderShippingMethod;
  /** Centimes. */
  shippingCostCents: number;
  /** Centimes. */
  discountCents: number;
  promoCodeId: number | null;
  /** Centimes — `amount_total` Stripe : la vérité du montant réellement encaissé, jamais recalculé ici. */
  totalCents: number;
  paidAtISO: string;
}

export interface OrderAssemblyError {
  error: string;
}

export interface OrderCreateData {
  status: "paid" | "failed";
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
}

/** Euros arrondis au centime — l'entrée est déjà des centimes entiers (même règle que `cart-core.ts`, sens inverse). */
function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
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
  };
}

/**
 * Nouveau stock après décrément d'une vente — plancher 0 (jamais négatif),
 * `null` (non suivi) reste `null` (jamais un plancher qui invente un suivi de
 * stock, même règle que `resolveNativePurchase`/`checkout-core.ts`).
 */
export function computeStockAfterDecrement(currentStock: number | null, qty: number): number | null {
  if (currentStock == null) return null;
  return Math.max(0, currentStock - qty);
}
