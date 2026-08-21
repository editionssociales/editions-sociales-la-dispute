import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { allContrepartieSlugs } from "@/lib/contreparties-core";

/**
 * Le chemin de l'argent, testé à travers son interface réelle : la server
 * action construit la session Checkout (métadonnées, montant serveur, adresse,
 * `donLines`) et msw joue Stripe au niveau réseau — aucun mock du SDK. Rendu
 * possible par l'alias `server-only` de vitest.config.ts.
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

/**
 * Fiches de contrepartie factices — un id STABLE par slug réel de
 * `CONTREPARTIES_2026` (`allContrepartieSlugs`, pur, jamais mocké), pour que
 * `donLines` reste prévisible d'un test à l'autre. `omitSlug` simule une
 * fiche absente en base (slug jamais créé dans Payload) : `afterEach` restaure
 * toujours la carte complète, aucune fuite entre tests.
 */
type FakeContrepartieBook = { id: number; title: string };
const FULL_CONTREPARTIE_BOOKS: Record<string, FakeContrepartieBook> = Object.fromEntries(
  allContrepartieSlugs().map((slug, i) => [slug, { id: i + 1, title: slug }]),
);
const bookId = (slug: string): number => FULL_CONTREPARTIE_BOOKS[slug].id;
let contrepartieBooks: Record<string, FakeContrepartieBook> = { ...FULL_CONTREPARTIE_BOOKS };
const omitSlug = (slug: string) => {
  const rest = { ...contrepartieBooks };
  delete rest[slug];
  contrepartieBooks = rest;
};

vi.mock("@/lib/contreparties", () => ({
  getContrepartieBooksBySlugs: async (slugs: string[]) => {
    const map = new Map<string, FakeContrepartieBook>();
    for (const slug of slugs) {
      const book = contrepartieBooks[slug];
      if (book) map.set(slug, book);
    }
    return map;
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
  return { stripeEnabled: () => true, getStripe: () => client };
});

// `vi.stubEnv` (auto-restauré) plutôt qu'une mutation de process.env au
// scope module, qui fuirait vers les autres fichiers de test du worker.
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.exemple.test");

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
  contrepartieBooks = { ...FULL_CONTREPARTIE_BOOKS };
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

const form = (entries: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("createDonationCheckout — palier fixe (sans choix)", () => {
  it("redirige vers l'URL de session et duplique les metadata sur payment_intent_data", async () => {
    // palier-75 (« Camarade fidèle ») : physique, SANS section `choix` — les
    // paliers à choix (50/100/200/1000) ont leur propre describe plus bas.
    await expect(createDonationCheckout(form({ tierId: "palier-75" }))).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1",
    );

    // Le contrat exact que la jauge recherche (metadata de session → PI → Charge).
    expect(lastBody?.get("metadata[kind]")).toBe("donation");
    expect(lastBody?.get("metadata[campaign]")).toBe("souscription-2026");
    expect(lastBody?.get("metadata[tier]")).toBe("palier-75");
    expect(lastBody?.get("payment_intent_data[metadata][kind]")).toBe("donation");
    expect(lastBody?.get("payment_intent_data[metadata][campaign]")).toBe("souscription-2026");
    expect(lastBody?.get("payment_intent_data[metadata][tier]")).toBe("palier-75");

    // Montant dérivé SERVEUR de DONATION_TIERS (jamais du client), en centimes.
    expect(lastBody?.get("line_items[0][price_data][unit_amount]")).toBe("7500");
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
});

describe("createDonationCheckout — montant libre", () => {
  it("virgule décimale acceptée, converti en centimes, tier=libre, PAS de collecte d'adresse", async () => {
    await expect(createDonationCheckout(form({ amount: "42,50" }))).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1",
    );
    expect(lastBody?.get("line_items[0][price_data][unit_amount]")).toBe("4250");
    expect(lastBody?.get("metadata[tier]")).toBe("libre");
    // Sans palier (pas de contrepartie physique), aucune adresse demandée —
    // seul comportement piloté par `parsed.tier?.physical`.
    expect(lastBody?.get("shipping_address_collection[allowed_countries][0]")).toBeNull();
    // Un montant libre n'est jamais une contrepartie : pas de `donLines`.
    expect(lastBody?.get("metadata[donLines]")).toBeNull();
  });

  it("montant hors bornes → /souscription/erreur?raison=montant sans appeler Stripe", async () => {
    await expect(createDonationCheckout(form({ amount: "3" }))).rejects.toThrow(
      "NEXT_REDIRECT:/souscription/erreur?raison=montant",
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
    await expect(createDonationCheckout(form({ tierId: "palier-75" }))).rejects.toThrow(
      "NEXT_REDIRECT:/souscription/erreur",
    );
  });

  it("session créée sans URL → /souscription/erreur, jamais redirect(null)", async () => {
    server.use(
      http.post("https://api.stripe.com/v1/checkout/sessions", () =>
        HttpResponse.json({ id: "cs_test_1", url: null }),
      ),
    );
    await expect(createDonationCheckout(form({ tierId: "palier-75" }))).rejects.toThrow(
      "NEXT_REDIRECT:/souscription/erreur",
    );
  });
});

describe("createDonationCheckout — contrepartie (contrat metadata.donLines)", () => {
  it("palier fixe : composition complète encodée, unitPriceCents à 0 (palier-15, un seul item)", async () => {
    await expect(createDonationCheckout(form({ tierId: "palier-15" }))).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1",
    );
    expect(lastBody?.get("metadata[donLines]")).toBe(`${bookId("planche-de-stickers")}:1:0`);
  });

  it("palier fixe à plusieurs items : ordre de composition préservé (palier-75)", async () => {
    await expect(createDonationCheckout(form({ tierId: "palier-75" }))).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1",
    );
    expect(lastBody?.get("metadata[donLines]")).toBe(
      [
        `${bookId("les-luttes-de-classes-en-france")}:1:0`,
        `${bookId("le-communisme-qui-vient")}:1:0`,
        `${bookId("totebag")}:1:0`,
        `${bookId("planche-de-stickers")}:1:0`,
      ].join(";"),
    );
  });

  it("palier à choix, sélection valide : option choisie + inclus, session Stripe créée", async () => {
    await expect(
      createDonationCheckout(form({ tierId: "palier-50", "choix.titre": "antifascisme" })),
    ).rejects.toThrow("NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1");
    expect(lastBody?.get("metadata[tier]")).toBe("palier-50");
    expect(lastBody?.get("metadata[donLines]")).toBe(
      [
        `${bookId("decouvrir-lantifascisme")}:1:0`,
        `${bookId("totebag")}:1:0`,
        `${bookId("planche-de-stickers")}:1:0`,
      ].join(";"),
    );
  });

  it("palier à choix, l'autre option : composition différente, adresse toujours collectée (plus grand palier)", async () => {
    await expect(
      createDonationCheckout(form({ tierId: "palier-1000", "choix.pack": "geme" })),
    ).rejects.toThrow("NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_test_1");
    expect(lastBody?.get("shipping_address_collection[allowed_countries][0]")).toBe("FR");
    expect(lastBody?.get("metadata[donLines]")).toBe(
      [`${bookId("pack-5-geme")}:1:0`, `${bookId("totebag")}:1:0`, `${bookId("planche-de-stickers")}:1:0`].join(
        ";",
      ),
    );
  });

  it("palier à choix, aucune sélection → étape de choix dédiée, jamais Stripe", async () => {
    await expect(createDonationCheckout(form({ tierId: "palier-50" }))).rejects.toThrow(
      "NEXT_REDIRECT:/souscription/contrepartie/palier-50?erreur=choix",
    );
    expect(checkoutCalls).toBe(0);
  });

  it("palier à choix, option inconnue → étape de choix dédiée, jamais Stripe", async () => {
    await expect(
      createDonationCheckout(form({ tierId: "palier-200", "choix.duo": "n-importe-quoi" })),
    ).rejects.toThrow("NEXT_REDIRECT:/souscription/contrepartie/palier-200?erreur=choix");
    expect(checkoutCalls).toBe(0);
  });

  it("slug de la composition introuvable en base → /souscription/erreur?raison=contrepartie, jamais Stripe", async () => {
    omitSlug("planche-de-stickers");
    await expect(createDonationCheckout(form({ tierId: "palier-15" }))).rejects.toThrow(
      "NEXT_REDIRECT:/souscription/erreur?raison=contrepartie",
    );
    expect(checkoutCalls).toBe(0);
  });
});
