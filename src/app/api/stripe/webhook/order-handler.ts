import type Stripe from "stripe";
import type { Order } from "@/payload-types";
import { decodeCheckoutLines, type DecodedCheckoutLine } from "@/lib/checkout-core";
import { getCommerceBookRecords } from "@/lib/commerce-source";
import {
  createOrder,
  decrementBookStock,
  findOrderByPaymentIntent,
  findOrderBySessionId,
  updateOrder,
} from "@/lib/order-source";
import {
  buildOrderCreateData,
  type OrderAddressFacts,
  type OrderCountry,
  type OrderLineFacts,
  type OrderSessionFacts,
  type OrderShippingMethod,
} from "@/lib/order-webhook-core";
import { selectOrderMailer } from "@/lib/order-mail";

/**
 * Orchestration I/O du webhook côté `kind: "order"` (plan §4 étape 9) —
 * cœur pur de l'assemblage dans `order-webhook-core.ts`, décodage des lignes
 * dans `checkout-core.ts` (déjà testés séparément) ; ce module ne fait que la
 * composition Payload/Stripe, même découpage que `stock-import.ts` vis-à-vis
 * de `stock-import-core.ts`.
 *
 * Étend le webhook de la phase 1 SANS changer son comportement `kind:
 * "donation"` (`route.ts` ne route ici que si `metadata.kind === "order"`).
 */

const ORDER_COUNTRIES: readonly OrderCountry[] = ["FR", "BE", "CH"];

/** Restreint un code pays Stripe à l'ensemble vendu — `shipping_address_collection` ne devrait jamais renvoyer autre chose, repli défensif sur FR sinon. */
function toOrderCountry(country: string | null): OrderCountry {
  return (ORDER_COUNTRIES as readonly string[]).includes(country ?? "")
    ? (country as OrderCountry)
    : "FR";
}

/** Parse un montant en centimes posé en `metadata` Stripe — `0` si absent/non fini (metadata corrompue), jamais `NaN` stocké. */
function metadataCents(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Adresse Stripe (`collected_information.shipping_details`) → faits `Orders` — `null` si absente (anomalie sur une session complétée). */
function addressFromStripe(
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

function paymentIntentId(session: Stripe.Checkout.Session | Stripe.Charge): string | null {
  const pi = "payment_intent" in session ? session.payment_intent : null;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

/**
 * Joint les lignes décodées des `metadata` au titre/ISBN/stock relus
 * fraîchement (`commerce-source.ts`, le même seam que le checkout — le
 * stock y est nécessaire pour le décrément, pas seulement pour le snapshot).
 * Un id introuvable (livre supprimé entre le checkout et le webhook) est
 * omis — snapshot honnête plutôt qu'un titre inventé.
 */
async function resolveOrderLines(session: Stripe.Checkout.Session) {
  const decoded = decodeCheckoutLines(session.metadata?.lines);
  const books = await getCommerceBookRecords(decoded.map((l) => l.id));
  const lines: OrderLineFacts[] = decoded.flatMap((l) => {
    const book = books.get(l.id);
    if (!book) return [];
    return [
      {
        bookId: l.id,
        titleSnapshot: book.title,
        isbnSnapshot: book.isbn,
        quantity: l.qty,
        unitPriceCents: l.unitPriceCents,
      },
    ];
  });
  return { decoded, books, lines };
}

/** Assemble les faits `Orders` communs aux deux issues (payée/échouée) — seul le statut final diffère à l'appel de `buildOrderCreateData`. */
function sessionFacts(
  session: Stripe.Checkout.Session,
  lines: OrderLineFacts[],
  createdAtEpoch: number,
): OrderSessionFacts {
  const metadata = session.metadata ?? {};
  const promoCodeId = metadata.promoCodeId ? Number(metadata.promoCodeId) : null;
  return {
    stripeSessionId: session.id,
    stripePaymentIntentId: paymentIntentId(session),
    email: session.customer_details?.email ?? null,
    shippingAddress: addressFromStripe(session.collected_information?.shipping_details),
    lines,
    shippingMethod: (metadata.shippingMethod as OrderShippingMethod) ?? "standard",
    shippingCostCents: metadataCents(metadata.shippingCostCents),
    discountCents: metadataCents(metadata.discountCents),
    promoCodeId: promoCodeId && Number.isFinite(promoCodeId) ? promoCodeId : null,
    totalCents: session.amount_total ?? 0,
    paidAtISO: new Date(createdAtEpoch * 1000).toISOString(),
  };
}

/**
 * Décrémente le stock de chaque ligne — l'atomicité (plancher 0, jamais si
 * `stock` n'est pas suivi) est portée par `decrementBookStock` elle-même
 * (`order-source.ts`, issue #65, boucle comparer-puis-échanger) : ce module ne
 * fait plus que sauter les lignes dont le livre a disparu entre le checkout et
 * le webhook (`books` — snapshot `commerce-source` — ne les contient plus).
 */
async function decrementStock(
  decoded: DecodedCheckoutLine[],
  books: Awaited<ReturnType<typeof getCommerceBookRecords>>,
): Promise<void> {
  for (const line of decoded) {
    if (!books.has(line.id)) continue; // livre disparu — snapshot honnête, rien à décrémenter
    await decrementBookStock(line.id, line.qty);
  }
}

/**
 * `checkout.session.completed` / `checkout.session.async_payment_succeeded`
 * — crée la commande UNIQUEMENT quand le paiement est effectivement confirmé
 * (`payment_status === "paid"`) : pour un moyen de paiement différé,
 * `checkout.session.completed` peut se présenter en attente
 * (`payment_status !== "paid"`), auquel cas rien n'est créé ici — l'event
 * `async_payment_succeeded` (même fonction) confirmera plus tard.
 *
 * Idempotence PAR EFFET (issue #64), plus à l'entrée : un rejeu Stripe après
 * un échec partiel (process mort après `createOrder`, avant le décrément ou
 * l'e-mail) ne doit PAS ressortir immédiatement — chaque effet non encore
 * marqué (`stockDecremented`, `confirmationSent`, `Orders.ts`) s'exécute, quel
 * que soit le nombre de rejeux, jusqu'à ce que les trois étapes (création,
 * décrément, e-mail) soient posées. `resolveOrderLines` (snapshot + lecture
 * fraîche du stock) n'est appelée qu'une fois, mémoïsée le temps de l'appel :
 * inutile de relire `commerce-source` si l'effet correspondant est déjà
 * marqué fait (cas courant du rejeu totalement terminé).
 */
async function createPaidOrder(session: Stripe.Checkout.Session, createdAtEpoch: number): Promise<void> {
  if (session.payment_status !== "paid") return;

  let order: Order | null = await findOrderBySessionId(session.id);

  let resolved: Awaited<ReturnType<typeof resolveOrderLines>> | undefined;
  async function resolveOnce() {
    resolved ??= await resolveOrderLines(session);
    return resolved;
  }

  if (!order) {
    const { lines } = await resolveOnce();
    const orderData = buildOrderCreateData(sessionFacts(session, lines, createdAtEpoch), "paid");
    if ("error" in orderData) {
      throw new Error(orderData.error);
    }
    order = await createOrder(orderData);
  }

  if (!order.stockDecremented) {
    const { decoded, books } = await resolveOnce();
    await decrementStock(decoded, books);
    order = await updateOrder(order.id, { stockDecremented: true });
  }

  if (!order.confirmationSent) {
    await selectOrderMailer().sendOrderConfirmation({
      orderNumber: order.number ?? order.stripeSessionId,
      email: order.email,
      lines: (order.lines ?? []).map((l) => ({
        titleSnapshot: l.titleSnapshot,
        quantity: l.quantity,
        unitPriceTTC: l.unitPriceTTC,
      })),
      shippingCostTTC: order.shippingCostTTC,
      discountTTC: order.discountTTC ?? 0,
      totalTTC: order.totalTTC,
    });
    await updateOrder(order.id, { confirmationSent: true });
  }
}

/**
 * `checkout.session.async_payment_failed` — un moyen de paiement différé a
 * finalement échoué. Crée une commande de traçabilité `status: "failed"`
 * (idempotente par `stripeSessionId`) — SANS jamais décrémenter le stock
 * (aucune vente n'a eu lieu). Si une commande existe déjà pour cette session
 * (ordre d'arrivée des events), ne la ré-écrase pas.
 */
async function recordFailedOrder(session: Stripe.Checkout.Session, createdAtEpoch: number): Promise<void> {
  if (await findOrderBySessionId(session.id)) return;

  const { lines } = await resolveOrderLines(session);
  const orderData = buildOrderCreateData(sessionFacts(session, lines, createdAtEpoch), "failed");
  if ("error" in orderData) {
    throw new Error(orderData.error);
  }

  await createOrder(orderData);
}

/**
 * `charge.refunded` — retrouve la commande par `stripePaymentIntentId` (la
 * Charge ne porte pas l'id de session) et passe son statut à `refunded`.
 * PAS de re-crédit de stock automatique (décision volontairement
 * conservatrice, plan §4 étape 9 — le stock est recalé par le routeur
 * mensuel). Une charge remboursée sans commande retrouvée (event orphelin,
 * ordre d'arrivée improbable) ne jette pas : capturée par l'appelant si
 * besoin, ce module se contente de ne rien faire de plus qu'un no-op sûr.
 */
async function markOrderRefunded(charge: Stripe.Charge): Promise<{ found: boolean }> {
  const piId = paymentIntentId(charge);
  if (!piId) return { found: false };

  const order = await findOrderByPaymentIntent(piId);
  if (!order) return { found: false };

  if (order.status !== "refunded") {
    await updateOrder(order.id, { status: "refunded" });
  }
  return { found: true };
}

export interface OrderWebhookResult {
  handled: boolean;
  /** `false` uniquement pour `charge.refunded` sans commande retrouvée — l'appelant peut vouloir le signaler (Sentry) sans faire échouer le webhook. */
  orderFound?: boolean;
}

/** Point d'entrée appelé par `route.ts` quand `metadata.kind === "order"`. */
export async function handleOrderWebhookEvent(event: Stripe.Event): Promise<OrderWebhookResult> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      await createPaidOrder(event.data.object as Stripe.Checkout.Session, event.created);
      return { handled: true };
    }
    case "checkout.session.async_payment_failed": {
      await recordFailedOrder(event.data.object as Stripe.Checkout.Session, event.created);
      return { handled: true };
    }
    case "charge.refunded": {
      const { found } = await markOrderRefunded(event.data.object as Stripe.Charge);
      return { handled: true, orderFound: found };
    }
    default:
      return { handled: false };
  }
}

