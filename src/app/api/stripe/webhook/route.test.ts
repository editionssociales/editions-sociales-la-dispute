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
  orderType: string;
  status: string;
  email: string;
  stockDecremented: boolean;
  confirmationSent: boolean;
  [key: string]: unknown;
}

let orders: FakeOrder[] = [];
let nextOrderId = 1;
let stockUpdates: { id: number; stock: number }[] = [];
/** Simule un crash APRÈS la création de la commande mais AVANT le décrément (issue #64) — consommé une fois, sur le PROCHAIN décrément (quelle que soit la partie, commande ou précommande). */
let failNextDecrement = false;

interface FakeBookRecord {
  title: string;
  isbn: string | null;
  stock: number | null;
}

let bookRecords: Record<number, FakeBookRecord> = {};

vi.mock("@/lib/order-source", () => ({
  findOrderBySessionId: async (stripeSessionId: string, orderType: string) =>
    orders.find((o) => o.stripeSessionId === stripeSessionId && o.orderType === orderType) ?? null,
  findOrdersByPaymentIntent: async (stripePaymentIntentId: string) =>
    orders.filter((o) => o.stripePaymentIntentId === stripePaymentIntentId),
  createOrder: async (data: Record<string, unknown>) => {
    const doc: FakeOrder = {
      id: nextOrderId++,
      stockDecremented: false,
      confirmationSent: false,
      ...data,
    } as FakeOrder;
    orders.push(doc);
    return doc;
  },
  updateOrder: async (id: number, data: Record<string, unknown>) => {
    const order = orders.find((o) => o.id === id);
    if (order) Object.assign(order, data);
    return order;
  },
  decrementBookStock: async (id: number, qty: number, opts?: { allowNegative?: boolean }) => {
    if (failNextDecrement) {
      failNextDecrement = false;
      throw new Error("crash simulé après création, avant décrément (issue #64)");
    }
    const record = bookRecords[id];
    if (!record || record.stock == null) return; // stock non suivi — rien à décrémenter
    // `allowNegative` (don avec contrepartie, client 2026-08-21) : même
    // comportement que le vrai `order-source.ts`, cf. `route.test.ts` § dons.
    record.stock = opts?.allowNegative ? record.stock - qty : Math.max(0, record.stock - qty);
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

// Le chemin don lit via `contreparties.ts` (brouillons inclus) — même fixture
// `bookRecords`, resservie sous la forme `ContrepartieBook` (id/title/isbn).
vi.mock("@/lib/contreparties", () => ({
  getContrepartieBooksByIds: async (ids: number[]) => {
    const map = new Map<number, { id: number; title: string; isbn: string | null }>();
    for (const id of ids) {
      const record = bookRecords[id];
      if (record) map.set(id, { id, title: record.title, isbn: record.isbn });
    }
    return map;
  },
}));

const sendOrderConfirmation = vi.fn(async () => {});
vi.mock("@/lib/order-mail", () => ({
  logOrderMailer: { sendOrderConfirmation },
  selectOrderMailer: () => ({ sendOrderConfirmation }),
}));

const sendDonationThanks = vi.fn(async () => {});
vi.mock("@/lib/donation-mail", () => ({
  logDonationMailer: { sendDonationThanks },
  selectDonationMailer: () => ({ sendDonationThanks }),
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
    customer_details: { email: "client@exemple.fr", phone: "+33612345678" },
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
  failNextDecrement = false;
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

describe("POST /api/stripe/webhook — mail de remerciement (dons)", () => {
  function donationSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "cs_test_donation_1",
      object: "checkout.session",
      payment_status: "paid",
      customer_details: { email: "donatrice@exemple.fr" },
      metadata: { kind: "donation", campaign: "souscription-2026", tier: "palier-50" },
      ...overrides,
    };
  }

  it("checkout.session.completed payé → envoie le remerciement au donateur, invalide quand même la jauge", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_donation_1",
        type: "checkout.session.completed",
        object: donationSession(),
      }),
    );
    expect(res.status).toBe(200);
    expect(sendDonationThanks).toHaveBeenCalledTimes(1);
    expect(sendDonationThanks).toHaveBeenCalledWith({ email: "donatrice@exemple.fr" });
    expect(revalidateTag).toHaveBeenCalledWith("donations", "max");
  });

  it("checkout.session.async_payment_succeeded payé (moyen différé confirmé) → envoie aussi le remerciement", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_donation_async",
        type: "checkout.session.async_payment_succeeded",
        object: donationSession(),
      }),
    );
    expect(res.status).toBe(200);
    expect(sendDonationThanks).toHaveBeenCalledTimes(1);
  });

  it("metadata.kind absente (don legacy) → traité comme un don, remerciement envoyé", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_donation_no_kind",
        type: "checkout.session.completed",
        object: donationSession({ metadata: {} }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sendDonationThanks).toHaveBeenCalledTimes(1);
  });

  it("payment_status non « paid » (moyen différé en attente) → aucun email, jauge quand même invalidée", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_donation_pending",
        type: "checkout.session.completed",
        object: donationSession({ payment_status: "unpaid" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sendDonationThanks).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("donations", "max");
  });

  it("customer_details.email absent → aucun email, jamais d'exception", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_donation_no_email",
        type: "checkout.session.completed",
        object: donationSession({ customer_details: null }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sendDonationThanks).not.toHaveBeenCalled();
  });

  it("charge.refunded → jamais d'email (objet Charge, pas de session à remercier)", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_donation_refund",
        type: "charge.refunded",
        object: { id: "ch_test_donation", object: "charge", metadata: { kind: "donation" } },
      }),
    );
    expect(res.status).toBe(200);
    expect(sendDonationThanks).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("donations", "max");
  });

  it("kind: order (commande) → jamais le mailer de dons, même si la session porte un email", async () => {
    const res = await POST(
      signedEventRequest({ id: "evt_order_not_donation", type: "checkout.session.completed", object: checkoutSession() }),
    );
    expect(res.status).toBe(200);
    expect(sendDonationThanks).not.toHaveBeenCalled();
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
      // Collecté au paiement depuis le 2026-08-24 (client) — recopié tel quel.
      phone: "+33612345678",
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

  it("session sans téléphone (don, session antérieure au 2026-08-24) → commande créée quand même, téléphone vide", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_order_sans_tel",
        type: "checkout.session.completed",
        object: checkoutSession({ customer_details: { email: "client@exemple.fr" } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(1);
    expect(orders[0].phone).toBeNull();
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

  it("issue #64 — rejeu après échec partiel (crash après création, avant décrément) reprend l'effet manquant sans recréer la commande", async () => {
    failNextDecrement = true; // le process « meurt » juste après createOrder, avant decrementStock
    const request = () =>
      signedEventRequest({ id: "evt_order_partial", type: "checkout.session.completed", object: checkoutSession() });

    const first = await POST(request());
    expect(first.status).toBe(500); // le décrément a jeté — le webhook répond en erreur (Stripe rejouera)
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(orders).toHaveLength(1); // la commande a bien été créée malgré l'échec du décrément
    expect(orders[0].stockDecremented).toBe(false);
    expect(orders[0].confirmationSent).toBe(false);
    expect(stockUpdates).toEqual([]);
    expect(sendOrderConfirmation).not.toHaveBeenCalled();

    const second = await POST(request());
    expect(second.status).toBe(200);
    expect(orders).toHaveLength(1); // toujours une seule commande — jamais recréée à l'entrée
    expect(orders[0].stockDecremented).toBe(true);
    expect(orders[0].confirmationSent).toBe(true);
    expect(stockUpdates).toEqual([{ id: 12, stock: 3 }]); // décrémenté une seule fois, au rejeu
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
      orderType: "commande",
      status: "paid",
      email: "client@exemple.fr",
      stockDecremented: true,
      confirmationSent: true,
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

describe("POST /api/stripe/webhook — scission commande/précommande (client 2026-08-20)", () => {
  const MIXED_METADATA = {
    kind: "order",
    zone: "FR",
    shippingMethod: "standard",
    shippingCostCents: "550",
    discountCents: "0",
    preorderDiscountCents: "0",
    promoCodeId: "",
    lines: "12:2:1500", // commande normale : Le Capital ×2
    preorderLines: "13:1:1000", // précommande : À paraître ×1
  };

  function mixedCheckoutSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "cs_test_mixte_1",
      object: "checkout.session",
      payment_status: "paid",
      // normal: 2×1500 + 550 port = 3550 ; précommande: 1000 + 550 port = 1550 → 5100 combiné.
      amount_total: 5100,
      payment_intent: "pi_test_mixte_1",
      customer_details: { email: "client@exemple.fr" },
      collected_information: {
        shipping_details: {
          name: "Jean Dupont",
          address: { line1: "1 rue Paul Lafargue", line2: null, city: "Paris", postal_code: "75001", country: "FR" },
        },
      },
      metadata: MIXED_METADATA,
      ...overrides,
    };
  }

  beforeEach(() => {
    bookRecords = {
      12: { title: "Le Capital", isbn: "978-1", stock: 5 },
      13: { title: "À paraître", isbn: "978-2", stock: 3 },
    };
  });

  it("panier mixte payé → crée DEUX commandes (une par type), décrémente les DEUX stocks, envoie DEUX mails", async () => {
    const res = await POST(
      signedEventRequest({ id: "evt_mixte_1", type: "checkout.session.completed", object: mixedCheckoutSession() }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(2);

    const commande = orders.find((o) => o.orderType === "commande");
    const precommande = orders.find((o) => o.orderType === "precommande");
    expect(commande).toMatchObject({
      status: "paid",
      stripeSessionId: "cs_test_mixte_1",
      stripePaymentIntentId: "pi_test_mixte_1",
      shippingCostTTC: 5.5, // le tarif d'UN envoi, identique pour les deux commandes
      totalTTC: 35.5, // 2×15 + 5,50
      lines: [{ book: 12, titleSnapshot: "Le Capital", isbnSnapshot: "978-1", quantity: 2, unitPriceTTC: 15 }],
    });
    expect(precommande).toMatchObject({
      status: "paid",
      stripeSessionId: "cs_test_mixte_1",
      stripePaymentIntentId: "pi_test_mixte_1",
      shippingCostTTC: 5.5,
      totalTTC: 15.5, // 10 + 5,50
      lines: [{ book: 13, titleSnapshot: "À paraître", isbnSnapshot: "978-2", quantity: 1, unitPriceTTC: 10 }],
    });

    // Numéros distincts (ids Postgres distincts → `formatOrderNumber` distinct en amont, hors périmètre du mock ici).
    expect(commande!.id).not.toBe(precommande!.id);

    expect(stockUpdates).toEqual(
      expect.arrayContaining([
        { id: 12, stock: 3 }, // 5 - 2
        { id: 13, stock: 2 }, // 3 - 1
      ]),
    );
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(2);
  });

  it("rejeu (même session) → ne recrée AUCUNE des deux commandes, ne décrémente rien deux fois", async () => {
    const request = () =>
      signedEventRequest({ id: "evt_mixte_1", type: "checkout.session.completed", object: mixedCheckoutSession() });

    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);

    expect(orders).toHaveLength(2);
    expect(stockUpdates).toHaveLength(2);
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(2);
  });

  it("issue #64 sur panier scindé — crash après création de la commande normale (avant son décrément) : le rejeu reprend l'effet manquant ET crée la précommande jamais atteinte au premier passage", async () => {
    failNextDecrement = true; // consommé par le PREMIER decrementBookStock rencontré (partie « commande », traitée en premier)
    const request = () =>
      signedEventRequest({ id: "evt_mixte_partial", type: "checkout.session.completed", object: mixedCheckoutSession() });

    const first = await POST(request());
    expect(first.status).toBe(500); // le décrément de la partie « commande » a jeté
    expect(Sentry.captureException).toHaveBeenCalled();
    // La commande normale a été créée (avant l'échec du décrément) ; la
    // précommande n'a JAMAIS été atteinte (l'exception a interrompu la
    // fonction avant son propre appel) — aucune commande orpheline créée.
    expect(orders).toHaveLength(1);
    expect(orders[0].orderType).toBe("commande");
    expect(orders[0].stockDecremented).toBe(false);
    expect(stockUpdates).toEqual([]);

    const second = await POST(request());
    expect(second.status).toBe(200);
    expect(orders).toHaveLength(2); // la précommande, créée pour la première fois au rejeu
    const commande = orders.find((o) => o.orderType === "commande")!;
    const precommande = orders.find((o) => o.orderType === "precommande")!;
    expect(commande.stockDecremented).toBe(true);
    expect(commande.confirmationSent).toBe(true);
    expect(precommande.stockDecremented).toBe(true);
    expect(precommande.confirmationSent).toBe(true);
    expect(stockUpdates).toEqual(
      expect.arrayContaining([
        { id: 12, stock: 3 },
        { id: 13, stock: 2 },
      ]),
    );
    expect(stockUpdates).toHaveLength(2); // chaque livre décrémenté UNE seule fois au total
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(2);
  });

  it("charge.refunded sur un paiement scindé → LES DEUX commandes passent à refunded (même intention de paiement)", async () => {
    orders.push(
      {
        id: 1,
        stripeSessionId: "cs_test_mixte_1",
        stripePaymentIntentId: "pi_test_mixte_1",
        orderType: "commande",
        status: "paid",
        email: "client@exemple.fr",
        stockDecremented: true,
        confirmationSent: true,
      },
      {
        id: 2,
        stripeSessionId: "cs_test_mixte_1",
        stripePaymentIntentId: "pi_test_mixte_1",
        orderType: "precommande",
        status: "paid",
        email: "client@exemple.fr",
        stockDecremented: true,
        confirmationSent: true,
      },
    );

    const res = await POST(
      signedEventRequest({
        id: "evt_mixte_refund",
        type: "charge.refunded",
        object: {
          id: "ch_test_mixte",
          object: "charge",
          payment_intent: "pi_test_mixte_1",
          metadata: { kind: "order" },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(orders.find((o) => o.orderType === "commande")?.status).toBe("refunded");
    expect(orders.find((o) => o.orderType === "precommande")?.status).toBe("refunded");
  });

  it("panier HOMOGÈNE précommande (aucune ligne normale) → une seule commande, orderType « precommande », amount_total lui appartient ENTIÈREMENT", async () => {
    const session = mixedCheckoutSession({
      id: "cs_test_precommande_seule",
      amount_total: 1550,
      metadata: { ...MIXED_METADATA, lines: "", preorderLines: "13:1:1000" },
    });
    const res = await POST(
      signedEventRequest({ id: "evt_precommande_seule", type: "checkout.session.completed", object: session }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ orderType: "precommande", totalTTC: 15.5 });
  });

  it("anomalie : total scindé recomposé ≠ amount_total Stripe → signalé à Sentry, SANS bloquer la création (l'argent est déjà encaissé)", async () => {
    const session = mixedCheckoutSession({ amount_total: 999 }); // ne correspond à rien de réel
    const res = await POST(
      signedEventRequest({ id: "evt_mixte_anomalie", type: "checkout.session.completed", object: session }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(2); // les deux commandes créées quand même
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Webhook Stripe : total scindé (commande + précommande) ne reconstitue pas amount_total",
      expect.objectContaining({ level: "warning" }),
    );
  });
});

describe("POST /api/stripe/webhook — don avec contrepartie (client 2026-08-21)", () => {
  const DON_METADATA = {
    kind: "donation",
    campaign: "souscription-2026",
    tier: "palier-50",
    donLines: "21:1:0;22:1:0",
  };

  function donSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "cs_test_don_1",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 5000,
      payment_intent: "pi_test_don_1",
      customer_details: { email: "donatrice@exemple.fr" },
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
      metadata: DON_METADATA,
      ...overrides,
    };
  }

  beforeEach(() => {
    bookRecords = {
      21: { title: "Tote bag", isbn: null, stock: 0 },
      22: { title: "Planche de stickers", isbn: null, stock: 5 },
    };
  });

  it("checkout.session.completed payé avec donLines → crée la commande orderType don, décrémente le stock (négatif autorisé), envoie le récap, jamais le mailer simple ni la confirmation boutique", async () => {
    const res = await POST(
      signedEventRequest({ id: "evt_don_1", type: "checkout.session.completed", object: donSession() }),
    );
    expect(res.status).toBe(200);

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderType: "don",
      status: "paid",
      email: "donatrice@exemple.fr",
      stripeSessionId: "cs_test_don_1",
      stripePaymentIntentId: "pi_test_don_1",
      shippingMethod: "offert",
      shippingCostTTC: 0,
      discountTTC: 0,
      totalTTC: 50,
      promoCode: null,
      lines: [
        { book: 21, titleSnapshot: "Tote bag", isbnSnapshot: null, quantity: 1, unitPriceTTC: 0 },
        { book: 22, titleSnapshot: "Planche de stickers", isbnSnapshot: null, quantity: 1, unitPriceTTC: 0 },
      ],
    });
    expect(orders[0].shippingAddress).toMatchObject({ fullName: "Jean Dupont", city: "Paris", country: "FR" });

    // Tote bag : stock 0 → -1 (négatif autorisé, la contrepartie est toujours servie).
    expect(stockUpdates).toEqual(
      expect.arrayContaining([
        { id: 21, stock: -1 },
        { id: 22, stock: 4 },
      ]),
    );

    expect(sendDonationThanks).toHaveBeenCalledTimes(1);
    expect(sendDonationThanks).toHaveBeenCalledWith({
      email: "donatrice@exemple.fr",
      recap: {
        tierTitle: "Camarade de lecture",
        amountEuros: 50,
        lines: [
          { title: "Tote bag", quantity: 1 },
          { title: "Planche de stickers", quantity: 1 },
        ],
        shippingAddress: expect.objectContaining({ fullName: "Jean Dupont", city: "Paris" }),
      },
    });

    // Jamais le mailer boutique pour un don.
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it("rejoué (même session) → ne recrée pas la commande, ne décrémente pas deux fois, ne renvoie pas le mail", async () => {
    const request = () =>
      signedEventRequest({ id: "evt_don_1", type: "checkout.session.completed", object: donSession() });

    const first = await POST(request());
    expect(first.status).toBe(200);
    const second = await POST(request());
    expect(second.status).toBe(200);

    expect(orders).toHaveLength(1);
    expect(stockUpdates).toHaveLength(2); // chaque livre décrémenté une seule fois au total
    expect(sendDonationThanks).toHaveBeenCalledTimes(1);
  });

  it("livre de contrepartie introuvable → ligne conservée avec un titre de repli, Sentry warning, jamais une ligne perdue", async () => {
    bookRecords = { 22: { title: "Planche de stickers", isbn: null, stock: 5 } }; // le livre 21 n'existe plus

    const res = await POST(
      signedEventRequest({ id: "evt_don_missing_book", type: "checkout.session.completed", object: donSession() }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(1);
    expect(orders[0].lines).toEqual([
      { book: 21, titleSnapshot: "Article #21", isbnSnapshot: null, quantity: 1, unitPriceTTC: 0 },
      { book: 22, titleSnapshot: "Planche de stickers", isbnSnapshot: null, quantity: 1, unitPriceTTC: 0 },
    ]);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Webhook Stripe (don) : article de contrepartie introuvable — titre de repli",
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("checkout.session.async_payment_succeeded avec donLines → confirme la commande don différée", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_don_async",
        type: "checkout.session.async_payment_succeeded",
        object: donSession(),
      }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(1);
    expect(orders[0].orderType).toBe("don");
    expect(sendDonationThanks).toHaveBeenCalledTimes(1);
  });

  it("payment_status non « paid » → aucune commande créée, aucun mail", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_don_pending",
        type: "checkout.session.completed",
        object: donSession({ payment_status: "unpaid" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(0);
    expect(sendDonationThanks).not.toHaveBeenCalled();
  });

  it("charge.refunded sur un don avec contrepartie → la commande don passe à refunded (chemin partagé avec le commerce)", async () => {
    orders.push({
      id: 1,
      stripeSessionId: "cs_test_don_1",
      stripePaymentIntentId: "pi_test_don_1",
      orderType: "don",
      status: "paid",
      email: "donatrice@exemple.fr",
      stockDecremented: true,
      confirmationSent: true,
    });

    const res = await POST(
      signedEventRequest({
        id: "evt_don_refund",
        type: "charge.refunded",
        object: {
          id: "ch_test_don",
          object: "charge",
          payment_intent: "pi_test_don_1",
          metadata: { kind: "donation" },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(orders[0].status).toBe("refunded");
    expect(revalidateTag).toHaveBeenCalledWith("donations", "max");
  });

  it("charge.refunded sans commande associée (don sans contrepartie) → no-op silencieux, aucun warning Sentry", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_don_refund_orphan",
        type: "charge.refunded",
        object: {
          id: "ch_test_don_orphan",
          object: "charge",
          payment_intent: "pi_test_don_inconnu",
          metadata: { kind: "donation" },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("don à montant libre (sans donLines) → reste le mailer simple, aucune commande créée", async () => {
    const res = await POST(
      signedEventRequest({
        id: "evt_don_libre",
        type: "checkout.session.completed",
        object: donSession({ metadata: { kind: "donation", campaign: "souscription-2026", tier: "libre" } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(orders).toHaveLength(0);
    expect(sendDonationThanks).toHaveBeenCalledTimes(1);
    expect(sendDonationThanks).toHaveBeenCalledWith({ email: "donatrice@exemple.fr" });
  });
});
