import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * Le chemin de l'argent, testé à travers son interface réelle : la server
 * action construit la session Checkout (métadonnées, montant serveur, adresse)
 * et msw joue Stripe au niveau réseau — aucun mock du SDK. Rendu possible par
 * l'alias `server-only` de vitest.config.ts.
 */

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "preview.test" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    // Reproduit le contrat de Next : redirect() jette, l'appelant ne continue pas.
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
// Client Stripe RÉEL (sérialisation form-encoded du SDK conservée), sur le
// transport fetch du SDK : son NodeHttpClient n'écrit le corps qu'au
// `secureConnect` du socket — événement que le socket simulé de msw émet trop
// tôt, la requête resterait suspendue. Seul le transport est substitué.
vi.mock("@/lib/stripe", async () => {
  const Stripe = (await import("stripe")).default;
  const client = new Stripe("sk_test_composition", {
    maxNetworkRetries: 0,
    // Liaison tardive : globalThis.fetch n'est intercepté par msw qu'au
    // server.listen(), après la construction de ce client.
    httpClient: Stripe.createFetchHttpClient((...args: Parameters<typeof fetch>) =>
      globalThis.fetch(...args),
    ),
  });
  return { donationsEnabled: () => true, getStripe: () => client };
});

process.env.NEXT_PUBLIC_SITE_URL = "https://www.exemple.test";

const { createDonationCheckout } = await import("./actions");

/** Corps formulaire de la dernière session créée (formes `metadata[kind]`…). */
let lastBody: URLSearchParams | null = null;
let checkoutCalls = 0;

const server = setupServer(
  http.post("https://api.stripe.com/v1/checkout/sessions", async ({ request }) => {
    checkoutCalls++;
    lastBody = new URLSearchParams(await request.text());
    return HttpResponse.json({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  lastBody = null;
  checkoutCalls = 0;
});
afterAll(() => server.close());

const form = (entries: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("createDonationCheckout — palier fixe", () => {
  it("redirige vers l'URL de session et duplique les metadata sur payment_intent_data", async () => {
    await expect(createDonationCheckout(form({ tierId: "palier-50" }))).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1",
    );

    // Le contrat exact que la jauge recherche (metadata de session → PI → Charge).
    expect(lastBody?.get("metadata[kind]")).toBe("donation");
    expect(lastBody?.get("metadata[campaign]")).toBe("souscription-2026");
    expect(lastBody?.get("metadata[tier]")).toBe("palier-50");
    expect(lastBody?.get("payment_intent_data[metadata][kind]")).toBe("donation");
    expect(lastBody?.get("payment_intent_data[metadata][campaign]")).toBe("souscription-2026");
    expect(lastBody?.get("payment_intent_data[metadata][tier]")).toBe("palier-50");

    // Montant dérivé SERVEUR de DONATION_TIERS (jamais du client), en centimes.
    expect(lastBody?.get("line_items[0][price_data][unit_amount]")).toBe("5000");
    expect(lastBody?.get("submit_type")).toBe("donate");
    expect(lastBody?.get("locale")).toBe("fr");

    // Palier physique → collecte d'adresse FR/BE/CH.
    expect(lastBody?.get("shipping_address_collection[allowed_countries][0]")).toBe("FR");

    expect(lastBody?.get("success_url")).toBe(
      "https://www.exemple.test/souscription/merci?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(lastBody?.get("cancel_url")).toBe("https://www.exemple.test/souscription#paliers");
  });

  it("le montant du client est ignoré pour un palier (dérivation serveur)", async () => {
    await expect(
      createDonationCheckout(form({ tierId: "palier-15", amount: "999999" })),
    ).rejects.toThrow("NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1");
    expect(lastBody?.get("line_items[0][price_data][unit_amount]")).toBe("1500");
  });

  it("tous les paliers collectent l'adresse (plus de mécènes sans envoi) — vérifié sur le plus grand", async () => {
    await expect(createDonationCheckout(form({ tierId: "palier-1000" }))).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1",
    );
    expect(lastBody?.get("shipping_address_collection[allowed_countries][0]")).toBe("FR");
  });
});

describe("createDonationCheckout — montant libre", () => {
  it("virgule décimale acceptée, converti en centimes, tier=libre", async () => {
    await expect(createDonationCheckout(form({ amount: "42,50" }))).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1",
    );
    expect(lastBody?.get("line_items[0][price_data][unit_amount]")).toBe("4250");
    expect(lastBody?.get("metadata[tier]")).toBe("libre");
  });

  it("montant hors bornes → /souscription/erreur sans appeler Stripe", async () => {
    await expect(createDonationCheckout(form({ amount: "3" }))).rejects.toThrow(
      "NEXT_REDIRECT:/souscription/erreur",
    );
    expect(checkoutCalls).toBe(0);
  });
});

describe("createDonationCheckout — Stripe en échec", () => {
  it("erreur API → /souscription/erreur, jamais d'erreur brute", async () => {
    server.use(
      http.post("https://api.stripe.com/v1/checkout/sessions", () =>
        HttpResponse.json({ error: { message: "boom" } }, { status: 400 }),
      ),
    );
    await expect(createDonationCheckout(form({ tierId: "palier-50" }))).rejects.toThrow(
      "NEXT_REDIRECT:/souscription/erreur",
    );
  });
});
