import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

/**
 * Webhook Stripe testé à travers son interface réelle (Request → Response) :
 * signatures générées avec l'outillage officiel du SDK, `next/cache` et Sentry
 * observés par mock. Rendu possible par l'alias `server-only` (route →
 * `@/lib/stripe`).
 */

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
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

describe("POST /api/stripe/webhook — événements signés", () => {
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
