import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * `order-mail.ts` testé à travers son interface réelle : `logOrderMailer` ne
 * fait rien de vérifiable au-delà de ne pas jeter, `brevoOrderMailer` est
 * vérifié via msw (contrat `brevo.ts`), `selectOrderMailer` via la présence
 * de `BREVO_API_KEY`. Composition du webhook déjà couverte par
 * `api/stripe/webhook/route.test.ts` (mock en bloc) — ce fichier couvre le
 * module lui-même.
 */

const {
  brevoOrderMailer,
  logOrderMailer,
  renderOrderConfirmationEmail,
  selectOrderMailer,
} = await import("./order-mail");
type OrderMailPayload = Parameters<typeof renderOrderConfirmationEmail>[0];

const PAYLOAD: OrderMailPayload = {
  orderNumber: "ES-2026-042",
  email: "client@exemple.fr",
  lines: [
    { titleSnapshot: "Le Capital, Livre I", quantity: 1, unitPriceTTC: 12.5 },
    { titleSnapshot: "Salaires & <profits>", quantity: 2, unitPriceTTC: 5 },
  ],
  shippingCostTTC: 4.5,
  discountTTC: 2,
  totalTTC: 25,
};

describe("logOrderMailer — jamais de throw", () => {
  it("résout sans jeter", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(logOrderMailer.sendOrderConfirmation(PAYLOAD)).resolves.toBeUndefined();
    log.mockRestore();
  });
});

describe("renderOrderConfirmationEmail — pur", () => {
  it("échappe les caractères HTML d'un titre (jamais du HTML éditorial CMS)", () => {
    const { html, subject } = renderOrderConfirmationEmail(PAYLOAD);
    expect(subject).toBe("Confirmation de votre commande ES-2026-042");
    expect(html).toContain("Salaires &amp; &lt;profits&gt;");
    expect(html).not.toContain("<profits>");
  });

  it("affiche la remise seulement si positive", () => {
    const withoutDiscount = { ...PAYLOAD, discountTTC: 0 };
    expect(renderOrderConfirmationEmail(withoutDiscount).html).not.toContain("Remise");
    expect(renderOrderConfirmationEmail(PAYLOAD).html).toContain("Remise");
  });

  it("mentionne le numéro de commande et le total TTC", () => {
    const { html } = renderOrderConfirmationEmail(PAYLOAD);
    expect(html).toContain("ES-2026-042");
    expect(html).toContain("25,00");
  });
});

describe("renderOrderConfirmationEmail — précommande (scission panier, client 2026-08-20)", () => {
  const PREORDER_PAYLOAD: typeof PAYLOAD = { ...PAYLOAD, orderType: "precommande" };

  it("sujet et titre distincts, jamais le texte de commande normale", () => {
    const { subject, html } = renderOrderConfirmationEmail(PREORDER_PAYLOAD);
    expect(subject).toBe("Confirmation de votre précommande ES-2026-042");
    expect(html).toContain("PRÉCOMMANDE CONFIRMÉE");
    // « PRÉCOMMANDE CONFIRMÉE » contient la sous-chaîne « COMMANDE CONFIRMÉE » —
    // on vérifie l'ABSENCE du titre normal isolé, pas une non-inclusion naïve.
    expect(html).not.toContain(">COMMANDE CONFIRMÉE<");
    expect(html).not.toContain("Nous avons bien reçu votre commande <strong>");
  });

  it("bandeau « Précommande — expédiée à parution », jamais le texte de préparation habituel", () => {
    const { html, text } = renderOrderConfirmationEmail(PREORDER_PAYLOAD);
    expect(html).toContain("Précommande — expédiée à parution");
    expect(html).not.toContain("Votre commande est en cours de préparation");
    expect(text).toContain("Précommande — expédiée à parution");
  });

  it("orderType absent ou « commande » → gabarit historique inchangé", () => {
    const withoutType = renderOrderConfirmationEmail(PAYLOAD);
    const explicitCommande = renderOrderConfirmationEmail({ ...PAYLOAD, orderType: "commande" });
    expect(withoutType.subject).toBe("Confirmation de votre commande ES-2026-042");
    expect(explicitCommande.subject).toBe("Confirmation de votre commande ES-2026-042");
    expect(withoutType.html).toContain("COMMANDE CONFIRMÉE");
    expect(withoutType.html).toContain("Votre commande est en cours de préparation");
  });
});

describe("renderOrderConfirmationEmail — livre numérique (client 2026-08-24)", () => {
  const avecFichier: OrderMailPayload = {
    ...PAYLOAD,
    downloads: [{ title: "Notes sur Mill", url: "https://ld-es.fr/telechargement/12.7.abc" }],
  };

  it("bloc de téléchargement rendu en HTML ET en texte, avec le lien", () => {
    const { html, text } = renderOrderConfirmationEmail(avecFichier);
    expect(html).toContain("VOTRE EXEMPLAIRE NUMÉRIQUE");
    expect(html).toContain("https://ld-es.fr/telechargement/12.7.abc");
    expect(text).toContain("VOTRE EXEMPLAIRE NUMÉRIQUE");
    expect(text).toContain("https://ld-es.fr/telechargement/12.7.abc");
  });

  it("aucun fichier → aucun bloc, aucune promesse de téléchargement (cas de la quasi-totalité des commandes)", () => {
    const { html, text } = renderOrderConfirmationEmail(PAYLOAD);
    expect(html).not.toContain("EXEMPLAIRE NUMÉRIQUE");
    expect(html).not.toContain("/telechargement/");
    expect(text).not.toContain("EXEMPLAIRE NUMÉRIQUE");
  });

  it("plusieurs fichiers → titre au pluriel, un lien par titre", () => {
    const { html } = renderOrderConfirmationEmail({
      ...PAYLOAD,
      downloads: [
        { title: "Notes sur Mill", url: "https://ld-es.fr/telechargement/12.7.abc" },
        { title: "Le Capital", url: "https://ld-es.fr/telechargement/12.9.def" },
      ],
    });
    expect(html).toContain("VOS EXEMPLAIRES NUMÉRIQUES");
    expect(html).toContain("/telechargement/12.7.abc");
    expect(html).toContain("/telechargement/12.9.def");
  });

  it("le titre du fichier est échappé comme le reste (jamais du HTML brut dans un mail)", () => {
    const { html } = renderOrderConfirmationEmail({
      ...PAYLOAD,
      downloads: [{ title: "Marx & <Engels>", url: "https://ld-es.fr/telechargement/1.2.x" }],
    });
    expect(html).toContain("Marx &amp; &lt;Engels&gt;");
    expect(html).not.toContain("<Engels>");
  });
});

describe("selectOrderMailer", () => {
  it("BREVO_API_KEY absente → logOrderMailer", () => {
    expect(selectOrderMailer({})).toBe(logOrderMailer);
  });

  it("BREVO_API_KEY posée → brevoOrderMailer", () => {
    expect(selectOrderMailer({ BREVO_API_KEY: "xkeysib-test" })).toBe(brevoOrderMailer);
  });
});

describe("brevoOrderMailer — envoi réel (msw)", () => {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("poste vers /v3/smtp/email avec le destinataire de la commande", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("https://api.brevo.com/v3/smtp/email", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ messageId: "1" }, { status: 201 });
      }),
    );
    // `sendOrderConfirmation` lit `process.env` (contrat `OrderMailer`, pas
    // de paramètre `env` — même limite que `logOrderMailer`) : posé/retiré
    // autour de l'appel plutôt que de changer la forme de l'interface.
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    try {
      await brevoOrderMailer.sendOrderConfirmation(PAYLOAD);
    } finally {
      delete process.env.BREVO_API_KEY;
      delete process.env.CONTACT_TO_EMAIL;
    }
    expect(capturedBody).toMatchObject({
      to: [{ email: "client@exemple.fr" }],
      subject: "Confirmation de votre commande ES-2026-042",
    });
  });

  it("Brevo indisponible → ne jette jamais (log d'erreur, webhook non bloqué)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.post("https://api.brevo.com/v3/smtp/email", () => HttpResponse.error()));
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    try {
      await expect(brevoOrderMailer.sendOrderConfirmation(PAYLOAD)).resolves.toBeUndefined();
    } finally {
      delete process.env.BREVO_API_KEY;
      delete process.env.CONTACT_TO_EMAIL;
      error.mockRestore();
    }
  });

  it("BREVO_API_KEY posée mais CONTACT_TO_EMAIL absente → dégrade sans jeter, aucun appel réseau", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.BREVO_API_KEY = "xkeysib-test";
    delete process.env.CONTACT_TO_EMAIL;
    try {
      await expect(brevoOrderMailer.sendOrderConfirmation(PAYLOAD)).resolves.toBeUndefined();
    } finally {
      delete process.env.BREVO_API_KEY;
      warn.mockRestore();
    }
  });
});

describe("renderOrderConfirmationEmail — version texte (multipart)", () => {
  it("numéro de commande, total TTC et mention TVA présents dans le texte", () => {
    const { text } = renderOrderConfirmationEmail(PAYLOAD);
    expect(text).toContain(PAYLOAD.orderNumber);
    expect(text).toContain("Total TTC (TVA 5,5 % incluse)");
  });

  it("remise seulement si positive, dans le texte aussi", () => {
    const withoutDiscount = { ...PAYLOAD, discountTTC: 0 };
    expect(renderOrderConfirmationEmail(withoutDiscount).text).not.toContain("Remise");
    expect(renderOrderConfirmationEmail(PAYLOAD).text).toContain("Remise");
  });

  it("texte brut : aucune structure HTML, données reprises SANS échappement", () => {
    const { text } = renderOrderConfirmationEmail(PAYLOAD);
    expect(text).not.toContain("<table");
    expect(text).not.toContain("</");
    // Le titre est du text/plain : repris tel quel, jamais échappé (contrairement au HTML).
    expect(text).toContain("Salaires & <profits>");
    expect(text).not.toContain("&amp;");
  });
});
