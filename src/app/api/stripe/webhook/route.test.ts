import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

/**
 * Webhook Stripe testé à travers son interface réelle (Request → Response) :
 * signatures générées avec l'outillage officiel du SDK, `next/cache` et Sentry
 * observés par mock. Rendu possible par l'alias `server-only` (route →
 * `@/lib/stripe`).
 *
 * Côté commerce (`kind: "order"`, plan §4 étape 9) : `@/lib/order-source`
 * (seam nommé du cycle de vie Order — collection/where/options couverts par
 * `order-source.test.ts`) substitué par un magasin en mémoire, comme
 * `@/lib/commerce-source` (titre/ISBN/stock — couvert par
 * `commerce-source.test.ts`) et `@/lib/order-mail` (sélection de mailer —
 * LOG ou Brevo, plan §5, `order-mail.test.ts`) :
 * on ne revérifie ici que la COMPOSITION du webhook
 * (création/idempotence/décrément/remboursement) — pas le mock Payload
 * sous-jacent d'`order-source`, ni le choix Brevo/LOG lui-même
 * (`order-mail.test.ts`).
 */

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

interface FakeOrder {
  id: number;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  status: string;
  email: string;
  [key: string]: unknown;
}

let orders: FakeOrder[] = [];
let nextOrderId = 1;
let stockUpdates: { id: number; stock: number }[] = [];

interface FakeBookRecord {
  title: string;
  isbn: string | null;
  stock: number | null;
}

let bookRecords: Record<number, FakeBookRecord> = {};

vi.mock("@/lib/order-source", () => ({
  findOrderBySessionId: async (stripeSessionId: string) =>
    orders.find((o) => o.stripeSessionId === stripeSessionId) ?? null,
  findOrderByPaymentIntent: async (stripePaymentIntentId: string) =>
    orders.find((o) => o.stripePaymentIntentId === stripePaymentIntentId) ?? null,
  createOrder: async (data: Record<string, unknown>) => {
    const doc: FakeOrder = { id: nextOrderId++, ...data } as FakeOrder;
    orders.push(doc);
    return doc;
  },
  updateOrder: async (id: number, data: Record<string, unknown>) => {
    const order = orders.find((o) => o.id === id);
    if (order) Object.assign(order, data);
    return order;
  },
  decrementBookStock: async (id: number, qty: number) => {
    const record = bookRecords[id];
    if (!record || record.stock == null) return; // stock non suivi — rien à décrémenter
    record.stock = Math.max(0, record.stock - qty);
    stockUpdates.push({ id, stock: record.stock });
  },
}));

vi.mock("@/lib/commerce-source", () => ({
  getCommerceBookRecords: async (ids: number[]) => {
    const map = new Map<number, FakeBookRecord>();
    for (const id of ids) {
      const record = bookRecords[id];
      if (record) map.set(id, record);
    }
    return map;
  },
}));

const sendOrderConfirmation = vi.fn(async () => {});
vi.mock("@/lib/order-mail", () => ({
  logOrderMailer: { sendOrderConfirmation },
  selectOrderMailer: () => ({ sendOrderConfirmation }),
}));

const WEBHOOK_SECRET = "whsec_test_composition";
process.env.STRIPE_SECRET_KEY = "sk_test_composition";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { POST } = await import("./route");
const { revalidateTag } = await import("next/cache");
const Sentry = await import("@sentry/nextjs");

const stripe = new Stripe("sk_test_composition");

/** Requête webhook signée (ou non) telle que Stripe l'enverrait. */
function webhookRequest(payload: string, signature?: string): Request {
  return new Request("https://www.exemple.test/api/stripe/webhook", {
    method: "POST",
    body: payload,
    headers: signature ? { "stripe-signature": signature } : {},
  });
}

function signedRequest(event: { id: string; type: string }): Request {
  const payload = JSON.stringify({ ...event, object: "event", data: { object: {} } });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return webhookRequest(payload, signature);
}

/** Requête webhook signée avec un `data.object` complet (événements `kind: "order"`). */
function signedEventRequest(event: {
  id: string;
  type: string;
  created?: number;
  object: Record<string, unknown>;
}): Request {
  const payload = JSON.stringify({
    id: event.id,
    type: event.type,
    created: event.created ?? 1752313200,
    object: "event",
    data: { object: event.object },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return webhookRequest(payload, signature);
}

const ORDER_METADATA = {
  kind: "order",
  zone: "FR",
  shippingMethod: "standard",
  shippingCostCents: "650",
  discountCents: "0",
  promoCodeId: "",
  lines: "12:2:1500",
};

function checkoutSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cs_test_order_1",
    object: "checkout.session",
    payment_status: "paid",
    amount_total: 3650,
    payment_intent: "pi_test_order_1",
    customer_details: { email: "client@exemple.fr" },
    collected_information: {
      shipping_details: {
        name: "Jean Dupont",
        address: {
          line1: "1 rue Paul Lafargue",
          line2: null,
          city: "Paris",
          postal_code: "75001",
          country: "FR",
        },
      },
    },
    metadata: ORDER_METADATA,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  orders = [];
  nextOrderId = 1;
  stockUpdates = [];
  bookRecords = { 12: { title: "Le Capital", isbn: "978-1", stock: 5 } };
});

describe("POST /api/stripe/webhook — signature", () => {
  it("signature invalide → 400 + capture Sentry (contrat P6, bloquant recette)", async () => {
    const res = await POST(webhookRequest("{}", "t=1,v1=bad"));
    expect(res.status).toBe(400);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Webhook Stripe : signature invalide",
      expect.objectContaining({ level: "warning" }),
    );
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("en-tête de signature absent → 400, jamais d'exception brute", async () => {
    const res = await POST(webhookRequest("{}"));
    expect(res.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("corps altéré après signature → 400 (la vérification porte sur le corps brut)", async () => {
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const res = await POST(webhookRequest(payload.replace("evt_1", "evt_2"), signature));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/stripe/webhook — événements signés (dons, kind absent)", () => {
  it.each([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "charge.refunded",
  ])("%s → 200 + revalidateTag('donations', 'max')", async (type) => {
    const res = await POST(signedRequest({ id: "evt_ok", type }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(revalidateTag).toHaveBeenCalledWith("donations", "max");
  });

  it("événement hors périmètre → 200 sans invalidation (le webhook reste idempotent)", async () => {
    const res = await POST(signedRequest({ id: "evt_other", type: "payment_intent.created" }));
    expect(res.status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("erreur pendant le traitement → 500 + capture Sentry (jamais silencieux)", async () => {
    vi.mocked(revalidateTag).mockImplementationOnce(() => {
      throw new Error("revalidation cassée");
    });
    const res = await POST(signedRequest({ id: "evt_boom", type: "charge.refunded" }));
    expect(res.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — commerce natif (kind: order)", () => {
  it("checkout.session.completed payé → crée la commande, décrémente le stock, envoie l'email", async () => {
    const res = await POST(
      signedEventRequest({ id: "evt_order_1", type: "checkout.session.completed", object: checkoutSession() }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      status: "paid",
      email: "client@exemple.fr",
      stripeSessionId: "cs_test_order_1",
      stripePaymentIntentId: "pi_test_order_1",
      shippingMethod: "standard",
      shippingCostTTC: 6.5,
      discountTTC: 0,
      totalTTC: 36.5,
      promoCode: null,
      lines: [
        { book: 12, titleSnapshot: "Le Capital", isbnSnapshot: "978-1", quantity: 2, unitPriceTTC: 15 },
      ],
    });
    expect(orders[0].shippingAddress).toMatchObject({ fullName: "Jean Dupont", city: "Paris", country: "FR" });

    // Stock 5 → 3 (décrément de 2, la quantité de la ligne).
    expect(stockUpdates).toEqual([{ id: 12, stock: 3 }]);
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
    expect(revalidateTag).not.toHaveBeenCalled(); // le chemin dons n'est jamais déclenché ici
  });

  it("rejoué (même session) → ne recrée pas la commande, ne décrémente pas deux fois", async () => {
    const request = () =>
      signedEventRequest({ id: "evt_order_1", type: "checkout.session.completed", object: checkoutSession() });

    const first = await POST(request());
    expect(first.status).toBe(200);
    const second = await POST(request());
    expect(second.status).toBe(200);

    expect(orders).toHaveLength(1);
    expect(stockUpdates).toEqual([{ id: 12, stock: 3 }]);
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it("payment_status non « paid » au complete (moyen différé en attente) → aucune commande créée", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_order_pending",
        type: "checkout.session.completed",
        object: checkoutSession({ payment_status: "unpaid" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(0);
    expect(stockUpdates).toEqual([]);
  });

  it("checkout.session.async_payment_succeeded → confirme la commande différée", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_order_async_ok",
        type: "checkout.session.async_payment_succeeded",
        object: checkoutSession(),
      }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("paid");
    expect(stockUpdates).toEqual([{ id: 12, stock: 3 }]);
  });

  it("checkout.session.async_payment_failed → commande de traçabilité « failed », JAMAIS de décrément", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_order_failed",
        type: "checkout.session.async_payment_failed",
        object: checkoutSession({ payment_status: "unpaid" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("failed");
    expect(stockUpdates).toEqual([]);
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it("charge.refunded → commande existante passe à « refunded », pas de recrédit de stock", async () => {
    orders.push({
      id: 1,
      stripeSessionId: "cs_test_order_1",
      stripePaymentIntentId: "pi_test_order_1",
      status: "paid",
      email: "client@exemple.fr",
    });

    const res = await POST(
      signedEventRequest({
        id: "evt_refund_1",
        type: "charge.refunded",
        object: {
          id: "ch_test_1",
          object: "charge",
          payment_intent: "pi_test_order_1",
          metadata: { kind: "order" },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(orders[0].status).toBe("refunded");
    expect(stockUpdates).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("charge.refunded orphelin (commande introuvable) → 200 + Sentry warning, jamais une exception", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_refund_orphan",
        type: "charge.refunded",
        object: {
          id: "ch_test_orphan",
          object: "charge",
          payment_intent: "pi_test_inconnu",
          metadata: { kind: "order" },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Webhook Stripe : remboursement sans commande associée",
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("ligne dont le livre a disparu entre le checkout et le webhook → omise, jamais un titre inventé", async () => {
    bookRecords = {}; // le livre 12 n'existe plus
    const res = await POST(
      signedEventRequest({ id: "evt_order_missing_book", type: "checkout.session.completed", object: checkoutSession() }),
    );
    expect(res.status).toBe(500); // aucune ligne exploitable → `buildOrderCreateData` refuse, remonte en erreur
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(orders).toHaveLength(0);
  });
});
