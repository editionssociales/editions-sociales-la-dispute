import config from "@payload-config";
import { getPayload } from "payload";
import type Stripe from "stripe";
import { decodeCheckoutLines, type DecodedCheckoutLine } from "@/lib/checkout-core";
import { getCheckoutBookRecords } from "@/lib/checkout-source";
import {
  buildOrderCreateData,
  computeStockAfterDecrement,
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

/** La commande existe-t-elle déjà pour cette session (idempotence — un event Stripe rejoué ne doit rien recréer) ? */
async function findOrderBySessionId(payload: Awaited<ReturnType<typeof getPayload>>, stripeSessionId: string) {
  const { docs } = await payload.find({
    collection: "orders",
    where: { stripeSessionId: { equals: stripeSessionId } },
    limit: 1,
    overrideAccess: true,
  });
  return docs[0] ?? null;
}

/**
 * Joint les lignes décodées des `metadata` au titre/ISBN/stock relus
 * fraîchement (`checkout-source.ts`, la même façade que le checkout — le
 * stock y est nécessaire pour le décrément, pas seulement pour le snapshot).
 * Un id introuvable (livre supprimé entre le checkout et le webhook) est
 * omis — snapshot honnête plutôt qu'un titre inventé.
 */
async function resolveOrderLines(session: Stripe.Checkout.Session) {
  const decoded = decodeCheckoutLines(session.metadata?.lines);
  const books = await getCheckoutBookRecords(decoded.map((l) => l.id));
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
    shippingCostCents: Number(metadata.shippingCostCents ?? 0),
    discountCents: Number(metadata.discountCents ?? 0),
    promoCodeId: promoCodeId && Number.isFinite(promoCodeId) ? promoCodeId : null,
    totalCents: session.amount_total ?? 0,
    paidAtISO: new Date(createdAtEpoch * 1000).toISOString(),
  };
}

/** Décrémente le stock de chaque ligne — plancher 0, jamais si `stock` n'est pas suivi (`null`). */
async function decrementStock(
  payload: Awaited<ReturnType<typeof getPayload>>,
  decoded: DecodedCheckoutLine[],
  books: Awaited<ReturnType<typeof getCheckoutBookRecords>>,
): Promise<void> {
  for (const line of decoded) {
    const book = books.get(line.id);
    if (!book) continue;
    const nextStock = computeStockAfterDecrement(book.stock, line.qty);
    if (nextStock === null) continue; // stock non suivi — rien à décrémenter
    await payload.update({
      collection: "books",
      id: line.id,
      data: { commerce: { stock: nextStock } },
      overrideAccess: true,
      // Même garde que l'import stock routeur (`stock-import.ts`) : écriture
      // automatisée, pas une édition humaine — ni `contentTouched` ni
      // revalidation par ligne (295 fiches potentiellement en jeu).
      context: { migration: true, disableRevalidate: true },
    });
  }
}

/**
 * `checkout.session.completed` / `checkout.session.async_payment_succeeded`
 * — crée la commande UNIQUEMENT quand le paiement est effectivement confirmé
 * (`payment_status === "paid"`) : pour un moyen de paiement différé,
 * `checkout.session.completed` peut se présenter en attente
 * (`payment_status !== "paid"`), auquel cas rien n'est créé ici — l'event
 * `async_payment_succeeded` (même fonction) confirmera plus tard. Décrémente
 * le stock de chaque ligne dans la FOULÉE de la création — jamais si la
 * commande existait déjà (idempotence par `stripeSessionId`).
 */
async function createPaidOrder(session: Stripe.Checkout.Session, createdAtEpoch: number): Promise<void> {
  if (session.payment_status !== "paid") return;

  const payload = await getPayload({ config });
  if (await findOrderBySessionId(payload, session.id)) return; // rejoué — ne décrémente pas deux fois

  const { decoded, books, lines } = await resolveOrderLines(session);
  const orderData = buildOrderCreateData(sessionFacts(session, lines, createdAtEpoch), "paid");
  if ("error" in orderData) {
    throw new Error(orderData.error);
  }

  const order = await payload.create({
    collection: "orders",
    data: orderData,
    overrideAccess: true,
    // Écriture opérationnelle du webhook, pas une édition humaine : ni
    // `contentTouched` (bascule Lexical, sans objet sur `orders` de toute
    // façon) ni revalidation Next pour une commande (contrat CLAUDE.md).
    context: { disableRevalidate: true },
  });

  await decrementStock(payload, decoded, books);

  await selectOrderMailer().sendOrderConfirmation({
    orderNumber: (order as { number?: string }).number ?? orderData.stripeSessionId,
    email: orderData.email,
    lines: orderData.lines.map((l) => ({
      titleSnapshot: l.titleSnapshot,
      quantity: l.quantity,
      unitPriceTTC: l.unitPriceTTC,
    })),
    shippingCostTTC: orderData.shippingCostTTC,
    discountTTC: orderData.discountTTC,
    totalTTC: orderData.totalTTC,
  });
}

/**
 * `checkout.session.async_payment_failed` — un moyen de paiement différé a
 * finalement échoué. Crée une commande de traçabilité `status: "failed"`
 * (idempotente par `stripeSessionId`) — SANS jamais décrémenter le stock
 * (aucune vente n'a eu lieu). Si une commande existe déjà pour cette session
 * (ordre d'arrivée des events), ne la ré-écrase pas.
 */
async function recordFailedOrder(session: Stripe.Checkout.Session, createdAtEpoch: number): Promise<void> {
  const payload = await getPayload({ config });
  if (await findOrderBySessionId(payload, session.id)) return;

  const { lines } = await resolveOrderLines(session);
  const orderData = buildOrderCreateData(sessionFacts(session, lines, createdAtEpoch), "failed");
  if ("error" in orderData) {
    throw new Error(orderData.error);
  }

  await payload.create({
    collection: "orders",
    data: orderData,
    overrideAccess: true,
    context: { disableRevalidate: true },
  });
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

  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "orders",
    where: { stripePaymentIntentId: { equals: piId } },
    limit: 1,
    overrideAccess: true,
  });
  const order = docs[0];
  if (!order) return { found: false };

  if (order.status !== "refunded") {
    await payload.update({
      collection: "orders",
      id: order.id,
      data: { status: "refunded" },
      overrideAccess: true,
      context: { disableRevalidate: true },
    });
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

