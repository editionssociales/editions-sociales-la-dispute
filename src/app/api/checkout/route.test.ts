import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { CheckoutBookLookup } from "@/lib/checkout-core";
import type { PromoCodeRecord } from "@/lib/checkout-source";

/**
 * `POST /api/checkout` testé à travers son interface réelle (Request →
 * Response) : msw joue Stripe au niveau réseau (même client fetch injecté que
 * `souscription/actions.test.ts` — le `NodeHttpClient` du SDK attend un
 * `secureConnect` que msw émet trop tôt). `@/lib/checkout-source` est mocké
 * en bloc (déjà couvert par sa propre nature de façade mince, même
 * traitement que `@/lib/cart-source` dans `panier/actions.test.ts`) — on ne
 * revérifie ici que la COMPOSITION : re-validation serveur, refus, appel
 * Stripe (metadata, coupon, ligne de port).
 */

type FakeBook = CheckoutBookLookup;

let books: Record<number, FakeBook> = {};
let promoCodes: Record<string, PromoCodeRecord> = {};

vi.mock("@/lib/checkout-source", () => ({
  getCheckoutBookRecords: async (ids: number[]) => {
    const map = new Map<number, FakeBook>();
    for (const id of ids) {
      const book = books[id];
      if (book) map.set(id, book);
    }
    return map;
  },
  getPromoCodeRecord: async (code: string) => promoCodes[code] ?? null,
}));

vi.mock("@/lib/stripe", async () => {
  const Stripe = (await import("stripe")).default;
  const client = new Stripe("sk_test_composition", {
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient((...args: Parameters<typeof fetch>) =>
      globalThis.fetch(...args),
    ),
  });
  return { donationsEnabled: () => true, getStripe: () => client };
});

process.env.NEXT_PUBLIC_SITE_URL = "https://www.exemple.test";
process.env.COMMERCE_NATIVE = "1";

const { POST } = await import("./route");

let lastCouponBody: URLSearchParams | null = null;
let lastSessionBody: URLSearchParams | null = null;
let couponCalls = 0;
let sessionCalls = 0;

const server = setupServer(
  http.post("https://api.stripe.com/v1/coupons", async ({ request }) => {
    couponCalls++;
    lastCouponBody = new URLSearchParams(await request.text());
    return HttpResponse.json({ id: "coupon_test_1", object: "coupon" });
  }),
  http.post("https://api.stripe.com/v1/checkout/sessions", async ({ request }) => {
    sessionCalls++;
    lastSessionBody = new URLSearchParams(await request.text());
    return HttpResponse.json({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  lastCouponBody = null;
  lastSessionBody = null;
  couponCalls = 0;
  sessionCalls = 0;
});
afterAll(() => server.close());

function book(overrides: Partial<FakeBook> = {}): FakeBook {
  return {
    title: "Le Capital",
    isbn: "978-1",
    priceEuros: 15,
    publishedAt: "2020-01-01",
    sellable: true,
    stock: 10,
    reducedShippingFlag: false,
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request("https://www.exemple.test/api/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  books = { 12: book() };
  promoCodes = {};
  process.env.COMMERCE_NATIVE = "1";
});

describe("POST /api/checkout — garde COMMERCE_NATIVE", () => {
  it("flag off → 503, ni lecture ni appel Stripe", async () => {
    process.env.COMMERCE_NATIVE = "0";
    const res = await POST(request({ lines: [{ id: 12, qty: 1 }], zone: "FR" }));
    expect(res.status).toBe(503);
    expect(sessionCalls).toBe(0);
  });

  it("flag absent → 503 (défaut iso-rendu)", async () => {
    delete process.env.COMMERCE_NATIVE;
    const res = await POST(request({ lines: [{ id: 12, qty: 1 }], zone: "FR" }));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/checkout — validation du corps", () => {
  it("JSON invalide → 400", async () => {
    const res = await POST(
      new Request("https://www.exemple.test/api/checkout", { method: "POST", body: "{not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("panier vide → 400, jamais d'appel Stripe", async () => {
    const res = await POST(request({ lines: [], zone: "FR" }));
    expect(res.status).toBe(400);
    expect(sessionCalls).toBe(0);
  });
});

describe("POST /api/checkout — re-validation serveur des lignes", () => {
  it("prix trafiqué par le client → ignoré, le prix Payload fait foi", async () => {
    const res = await POST(
      request({ lines: [{ id: 12, qty: 1, unitPriceCents: 1 }], zone: "FR" }),
    );
    expect(res.status).toBe(200);
    expect(lastSessionBody?.get("line_items[0][price_data][unit_amount]")).toBe("1500");
  });

  it("stock insuffisant → 422, refusals détaillées, jamais d'appel Stripe", async () => {
    books = { 12: book({ stock: 1 }) };
    const res = await POST(request({ lines: [{ id: 12, qty: 5 }], zone: "FR" }));
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.reason).toBe("lines");
    expect(body.refusals).toEqual([
      {
        id: 12,
        reason: "insufficient-stock",
        message: "Stock insuffisant pour « Le Capital » (1 exemplaire disponible).",
      },
    ]);
    expect(sessionCalls).toBe(0);
  });

  it("livre non sellable → 422", async () => {
    books = { 12: book({ sellable: false }) };
    const res = await POST(request({ lines: [{ id: 12, qty: 1 }], zone: "FR" }));
    expect(res.status).toBe(422);
    expect(sessionCalls).toBe(0);
  });

  it("livre introuvable (id absent de la relecture Payload) → 422", async () => {
    books = {};
    const res = await POST(request({ lines: [{ id: 999, qty: 1 }], zone: "FR" }));
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.refusals).toEqual([{ id: 999, reason: "not-found", message: "Livre introuvable ou dépublié." }]);
  });
});

describe("POST /api/checkout — zone", () => {
  it("zone hors FR/BE/CH → 422 (refus du moteur de port)", async () => {
    const res = await POST(request({ lines: [{ id: 12, qty: 1 }], zone: "DE" }));
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.reason).toBe("shipping");
    expect(sessionCalls).toBe(0);
  });
});

describe("POST /api/checkout — code promo", () => {
  it("code promo expiré → 422, jamais d'appel Stripe", async () => {
    promoCodes.PERIME = {
      id: 3,
      code: "PERIME",
      type: "fixed_cart",
      amount: 5,
      minCart: null,
      expiresAt: "2020-01-01",
      active: true,
    };
    const res = await POST(request({ lines: [{ id: 12, qty: 1 }], zone: "FR", promoCode: "PERIME" }));
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.reason).toBe("promo");
    expect(sessionCalls).toBe(0);
  });

  it("code promo fixed_cart valide → coupon Stripe créé puis appliqué à la session", async () => {
    promoCodes.AGREG2027 = {
      id: 3,
      code: "AGREG2027",
      type: "fixed_cart",
      amount: 5,
      minCart: null,
      expiresAt: null,
      active: true,
    };
    const res = await POST(
      request({ lines: [{ id: 12, qty: 2 }], zone: "FR", promoCode: "AGREG2027" }),
    );
    expect(res.status).toBe(200);
    expect(couponCalls).toBe(1);
    expect(lastCouponBody?.get("amount_off")).toBe("500");
    expect(lastCouponBody?.get("currency")).toBe("eur");
    expect(lastCouponBody?.get("duration")).toBe("once");
    expect(lastSessionBody?.get("discounts[0][coupon]")).toBe("coupon_test_1");
  });

  it("code promo free_shipping (panier ≥ 50€) → port à 0, pas de coupon", async () => {
    books = { 12: book({ priceEuros: 60 }) };
    promoCodes.LIVRAISON = {
      id: 4,
      code: "LIVRAISON",
      type: "free_shipping",
      amount: null,
      minCart: 50,
      expiresAt: null,
      active: true,
    };
    const res = await POST(
      request({ lines: [{ id: 12, qty: 1 }], zone: "FR", promoCode: "LIVRAISON" }),
    );
    expect(res.status).toBe(200);
    expect(couponCalls).toBe(0);
    expect(lastSessionBody?.get("metadata[shippingMethod]")).toBe("offert");
    // Ligne de port (dernière ligne) à 0.
    const shippingLineIndex = 1; // 1 ligne livre + 1 ligne de port
    expect(lastSessionBody?.get(`line_items[${shippingLineIndex}][price_data][unit_amount]`)).toBe("0");
  });

  it("pas de code promo soumis → jamais un refus (juste pas de remise)", async () => {
    const res = await POST(request({ lines: [{ id: 12, qty: 1 }], zone: "FR" }));
    expect(res.status).toBe(200);
    expect(couponCalls).toBe(0);
  });
});

describe("POST /api/checkout — session Stripe (cas nominal)", () => {
  it("crée la session : lignes TTC, port, metadata complètes (session + payment_intent_data), guest, adresses FR/BE/CH", async () => {
    const res = await POST(request({ lines: [{ id: 12, qty: 2 }], zone: "FR" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });

    expect(lastSessionBody?.get("mode")).toBe("payment");
    expect(lastSessionBody?.get("locale")).toBe("fr");
    expect(lastSessionBody?.get("customer_creation")).toBe("if_required");
    expect(lastSessionBody?.get("shipping_address_collection[allowed_countries][0]")).toBe("FR");
    expect(lastSessionBody?.get("shipping_address_collection[allowed_countries][1]")).toBe("BE");
    expect(lastSessionBody?.get("shipping_address_collection[allowed_countries][2]")).toBe("CH");

    expect(lastSessionBody?.get("line_items[0][quantity]")).toBe("2");
    expect(lastSessionBody?.get("line_items[0][price_data][unit_amount]")).toBe("1500");
    expect(lastSessionBody?.get("line_items[0][price_data][product_data][name]")).toBe("Le Capital");
    expect(lastSessionBody?.get("line_items[1][price_data][unit_amount]")).toBe("550"); // port standard : total 30€ → tranche 25-49€ → 5,50€

    expect(lastSessionBody?.get("metadata[kind]")).toBe("order");
    expect(lastSessionBody?.get("metadata[zone]")).toBe("FR");
    expect(lastSessionBody?.get("metadata[lines]")).toBe("12:2:1500");
    expect(lastSessionBody?.get("payment_intent_data[metadata][kind]")).toBe("order");
    expect(lastSessionBody?.get("payment_intent_data[metadata][lines]")).toBe("12:2:1500");

    expect(lastSessionBody?.get("success_url")).toBe(
      "https://www.exemple.test/merci?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(lastSessionBody?.get("cancel_url")).toBe("https://www.exemple.test/panier");
  });

  it("panier « manifeste » (tous les livres à port réduit) → shippingMethod=reduit, 2,50€", async () => {
    books = { 12: book({ reducedShippingFlag: true }) };
    const res = await POST(request({ lines: [{ id: 12, qty: 1 }], zone: "FR" }));
    expect(res.status).toBe(200);
    expect(lastSessionBody?.get("metadata[shippingMethod]")).toBe("reduit");
    expect(lastSessionBody?.get("line_items[1][price_data][unit_amount]")).toBe("250");
  });

  it("Stripe indisponible (session en échec) → 502, capture Sentry", async () => {
    server.use(
      http.post("https://api.stripe.com/v1/checkout/sessions", () =>
        HttpResponse.json({ error: { message: "boom" } }, { status: 400 }),
      ),
    );
    const res = await POST(request({ lines: [{ id: 12, qty: 1 }], zone: "FR" }));
    expect(res.status).toBe(502);
  });
});
