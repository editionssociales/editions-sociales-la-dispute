import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * Client Brevo testé à travers son interface réelle (msw joue l'API Brevo au
 * niveau réseau, l'alias `server-only` de vitest.config.ts rend le module
 * importable) — même traitement que `catalogue-http.test.ts`. Couvre surtout
 * le contrat de dégradation : `BREVO_API_KEY`/`BREVO_LIST_ID_SITE`/
 * `BREVO_DOI_TEMPLATE_ID`/`CONTACT_TO_EMAIL` absentes ou malformées → aucun
 * appel réseau, `{ ok: false }`, jamais un throw. `getNewsletterListStats`
 * (seule lecture du module, sans paramètre `env` — lit `process.env`
 * directement) suit le même contrat : env posé/retiré autour de chaque appel
 * (motif `brevoOrderMailer`, `order-mail.test.ts`), plutôt qu'un paramètre
 * `env` que sa signature exacte n'admet pas.
 */

const { brevoConfigured, getNewsletterListStats, sendDoiConfirmation, sendTransactionalEmail } =
  await import("./brevo");

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const CONFIGURED_ENV = {
  BREVO_API_KEY: "xkeysib-test",
  BREVO_LIST_ID_SITE: "42",
  BREVO_DOI_TEMPLATE_ID: "7",
  CONTACT_TO_EMAIL: "toutes@editionssociales.fr",
};

describe("brevoConfigured", () => {
  it("BREVO_API_KEY absente → false", () => {
    expect(brevoConfigured({})).toBe(false);
  });

  it("BREVO_API_KEY vide → false", () => {
    expect(brevoConfigured({ BREVO_API_KEY: "  " })).toBe(false);
  });

  it("BREVO_API_KEY posée → true (aucune forme requise, même traitement que STRIPE_SECRET_KEY)", () => {
    expect(brevoConfigured({ BREVO_API_KEY: "placeholder" })).toBe(true);
  });
});

describe("sendDoiConfirmation — dégradation", () => {
  it("BREVO_API_KEY absente → ok:false, aucun appel réseau", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendDoiConfirmation(
      { email: "a@exemple.fr", redirectionUrl: "https://exemple.fr/newsletter/confirmation", source: "site-2026" },
      {},
    );
    expect(result).toEqual({ ok: false, reason: "not-configured" });
    warn.mockRestore();
  });

  it("BREVO_LIST_ID_SITE non numérique → ok:false, aucun appel réseau", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendDoiConfirmation(
      { email: "a@exemple.fr", redirectionUrl: "https://exemple.fr/newsletter/confirmation", source: "site-2026" },
      { ...CONFIGURED_ENV, BREVO_LIST_ID_SITE: "abc" },
    );
    expect(result).toEqual({ ok: false, reason: "not-configured" });
    warn.mockRestore();
  });

  it("BREVO_DOI_TEMPLATE_ID absente → ok:false, aucun appel réseau", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendDoiConfirmation(
      { email: "a@exemple.fr", redirectionUrl: "https://exemple.fr/newsletter/confirmation", source: "site-2026" },
      { ...CONFIGURED_ENV, BREVO_DOI_TEMPLATE_ID: undefined },
    );
    expect(result).toEqual({ ok: false, reason: "not-configured" });
    warn.mockRestore();
  });
});

describe("sendDoiConfirmation — appel réel", () => {
  it("poste email/includeListIds/templateId/redirectionUrl/attributes.SOURCE, api-key en en-tête", async () => {
    let capturedBody: unknown = null;
    let capturedApiKey: string | null = null;
    server.use(
      http.post("https://api.brevo.com/v3/contacts/doubleOptinConfirmation", async ({ request }) => {
        capturedBody = await request.json();
        capturedApiKey = request.headers.get("api-key");
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const result = await sendDoiConfirmation(
      {
        email: "test@exemple.fr",
        redirectionUrl: "https://ld-es.fr/newsletter/confirmation",
        source: "site-2026",
      },
      CONFIGURED_ENV,
    );
    expect(result).toEqual({ ok: true });
    expect(capturedApiKey).toBe("xkeysib-test");
    expect(capturedBody).toEqual({
      email: "test@exemple.fr",
      includeListIds: [42],
      templateId: 7,
      redirectionUrl: "https://ld-es.fr/newsletter/confirmation",
      attributes: { SOURCE: "site-2026" },
    });
  });

  it("Brevo répond en erreur → ok:false, reason http-<status>, aucun throw", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.post("https://api.brevo.com/v3/contacts/doubleOptinConfirmation", () =>
        HttpResponse.json({ message: "invalid" }, { status: 400 }),
      ),
    );
    const result = await sendDoiConfirmation(
      { email: "a@exemple.fr", redirectionUrl: "https://exemple.fr/newsletter/confirmation", source: "site-2026" },
      CONFIGURED_ENV,
    );
    expect(result).toEqual({ ok: false, reason: "http-400" });
    error.mockRestore();
  });
});

describe("sendTransactionalEmail — dégradation", () => {
  it("BREVO_API_KEY absente → ok:false, aucun appel réseau", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendTransactionalEmail(
      { to: "visiteur@exemple.fr", subject: "Test", html: "<p>Test</p>" },
      { CONTACT_TO_EMAIL: "toutes@editionssociales.fr" },
    );
    expect(result).toEqual({ ok: false, reason: "not-configured" });
    warn.mockRestore();
  });

  it("CONTACT_TO_EMAIL absente → ok:false, aucun appel réseau", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendTransactionalEmail(
      { to: "visiteur@exemple.fr", subject: "Test", html: "<p>Test</p>" },
      { BREVO_API_KEY: "xkeysib-test" },
    );
    expect(result).toEqual({ ok: false, reason: "not-configured" });
    warn.mockRestore();
  });
});

describe("sendTransactionalEmail — appel réel", () => {
  it("expéditeur = CONTACT_TO_EMAIL (jamais l'adresse du visiteur), replyTo transmis", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("https://api.brevo.com/v3/smtp/email", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ messageId: "1" }, { status: 201 });
      }),
    );
    const result = await sendTransactionalEmail(
      {
        to: "toutes@editionssociales.fr",
        subject: "Nouveau message du site",
        html: "<p>Bonjour</p>",
        replyTo: "visiteur@exemple.fr",
        replyToName: "Une lectrice",
      },
      CONFIGURED_ENV,
    );
    expect(result).toEqual({ ok: true });
    expect(capturedBody).toEqual({
      sender: { email: "toutes@editionssociales.fr", name: "Les Éditions sociales × La Dispute" },
      to: [{ email: "toutes@editionssociales.fr" }],
      replyTo: { email: "visiteur@exemple.fr", name: "Une lectrice" },
      subject: "Nouveau message du site",
      htmlContent: "<p>Bonjour</p>",
    });
  });

  it("transmet la version texte (textContent) quand fournie", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("https://api.brevo.com/v3/smtp/email", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ messageId: "1" }, { status: 201 });
      }),
    );
    const result = await sendTransactionalEmail(
      {
        to: "toutes@editionssociales.fr",
        subject: "Test",
        html: "<p>Bonjour</p>",
        textContent: "Bonjour",
      },
      CONFIGURED_ENV,
    );
    expect(result).toEqual({ ok: true });
    expect(capturedBody).toMatchObject({ textContent: "Bonjour" });
  });
});

describe("getNewsletterListStats", () => {
  // `getNewsletterListStats` lit `process.env` (signature sans paramètre —
  // un autre agent l'importe telle quelle) : posé/retiré autour de chaque
  // appel, même limite/convention que `brevoOrderMailer` (`order-mail.test.ts`).

  it("BREVO_API_KEY absente → ok:false, aucun appel réseau", async () => {
    delete process.env.BREVO_API_KEY;
    process.env.BREVO_LIST_ID_SITE = "42";
    try {
      const result = await getNewsletterListStats();
      expect(result).toEqual({ ok: false });
    } finally {
      delete process.env.BREVO_LIST_ID_SITE;
    }
  });

  it("BREVO_LIST_ID_SITE absente ou non numérique → ok:false, aucun appel réseau", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test";
    delete process.env.BREVO_LIST_ID_SITE;
    try {
      expect(await getNewsletterListStats()).toEqual({ ok: false });
      process.env.BREVO_LIST_ID_SITE = "abc";
      expect(await getNewsletterListStats()).toEqual({ ok: false });
    } finally {
      delete process.env.BREVO_API_KEY;
      delete process.env.BREVO_LIST_ID_SITE;
    }
  });

  describe("appel réel (msw)", () => {
    // Réutilise le `server` msw déclaré en tête de fichier (déjà `listen()`)
    // — un second `setupServer()` interceptant le même `fetch` global en
    // parallèle serait un piège, pas une isolation.

    it("200 avec totalSubscribers → ok:true + valeur, GET vers /contacts/lists/{id} avec api-key", async () => {
      let capturedApiKey: string | null = null;
      let capturedMethod = "";
      server.use(
        http.get("https://api.brevo.com/v3/contacts/lists/42", ({ request }) => {
          capturedApiKey = request.headers.get("api-key");
          capturedMethod = request.method;
          return HttpResponse.json({ id: 42, name: "Inscrits site (2026)", totalSubscribers: 128 });
        }),
      );
      process.env.BREVO_API_KEY = "xkeysib-test";
      process.env.BREVO_LIST_ID_SITE = "42";
      try {
        const result = await getNewsletterListStats();
        expect(result).toEqual({ ok: true, totalSubscribers: 128 });
      } finally {
        delete process.env.BREVO_API_KEY;
        delete process.env.BREVO_LIST_ID_SITE;
      }
      expect(capturedMethod).toBe("GET");
      expect(capturedApiKey).toBe("xkeysib-test");
    });

    it("totalSubscribers absent, repli sur uniqueSubscribers → ok:true + valeur", async () => {
      server.use(
        http.get("https://api.brevo.com/v3/contacts/lists/42", () =>
          HttpResponse.json({ id: 42, uniqueSubscribers: 64 }),
        ),
      );
      process.env.BREVO_API_KEY = "xkeysib-test";
      process.env.BREVO_LIST_ID_SITE = "42";
      try {
        expect(await getNewsletterListStats()).toEqual({ ok: true, totalSubscribers: 64 });
      } finally {
        delete process.env.BREVO_API_KEY;
        delete process.env.BREVO_LIST_ID_SITE;
      }
    });

    it("200 avec un corps inattendu (compteur absent/non numérique) → ok:false", async () => {
      server.use(
        http.get("https://api.brevo.com/v3/contacts/lists/42", () =>
          HttpResponse.json({ id: 42, name: "Inscrits site (2026)" }),
        ),
      );
      process.env.BREVO_API_KEY = "xkeysib-test";
      process.env.BREVO_LIST_ID_SITE = "42";
      try {
        expect(await getNewsletterListStats()).toEqual({ ok: false });
      } finally {
        delete process.env.BREVO_API_KEY;
        delete process.env.BREVO_LIST_ID_SITE;
      }
    });

    it("réponse non-ok (HTTP 401) → ok:false, aucun throw", async () => {
      server.use(
        http.get("https://api.brevo.com/v3/contacts/lists/42", () =>
          HttpResponse.json({ message: "unauthorized" }, { status: 401 }),
        ),
      );
      process.env.BREVO_API_KEY = "xkeysib-test";
      process.env.BREVO_LIST_ID_SITE = "42";
      try {
        await expect(getNewsletterListStats()).resolves.toEqual({ ok: false });
      } finally {
        delete process.env.BREVO_API_KEY;
        delete process.env.BREVO_LIST_ID_SITE;
      }
    });

    it("exception réseau → ok:false, aucun throw", async () => {
      server.use(http.get("https://api.brevo.com/v3/contacts/lists/42", () => HttpResponse.error()));
      process.env.BREVO_API_KEY = "xkeysib-test";
      process.env.BREVO_LIST_ID_SITE = "42";
      try {
        await expect(getNewsletterListStats()).resolves.toEqual({ ok: false });
      } finally {
        delete process.env.BREVO_API_KEY;
        delete process.env.BREVO_LIST_ID_SITE;
      }
    });
  });
});
