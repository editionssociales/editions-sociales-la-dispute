import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * `donation-mail.ts` testé à travers son interface réelle — même découpage
 * que `order-mail.test.ts` : `logDonationMailer` ne fait rien de vérifiable
 * au-delà de ne pas jeter, `brevoDonationMailer` est vérifié via msw (contrat
 * `brevo.ts`), `selectDonationMailer` via la présence de `BREVO_API_KEY`.
 * Branchement webhook (paiement de don confirmé → email) couvert par
 * `api/stripe/webhook/route.test.ts`.
 */

const {
  brevoDonationMailer,
  logDonationMailer,
  renderDonationThanksEmail,
  selectDonationMailer,
} = await import("./donation-mail");

const PAYLOAD = { email: "donatrice@exemple.fr" };

describe("logDonationMailer — jamais de throw", () => {
  it("résout sans jeter", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(logDonationMailer.sendDonationThanks(PAYLOAD)).resolves.toBeUndefined();
    log.mockRestore();
  });
});

describe("renderDonationThanksEmail — pur, texte verbatim", () => {
  it("sujet exact « Merci pour votre don »", () => {
    const { subject } = renderDonationThanksEmail();
    expect(subject).toBe("Merci pour votre don");
  });

  it("contient le point médian inclusif « informé·es » (jamais « informé(e)s » ni une forme retouchée)", () => {
    const { html } = renderDonationThanksEmail();
    expect(html).toContain("informé·es");
  });

  it("mentionne « 100 ans d’existence » avec l'apostrophe typographique (jamais l'apostrophe droite)", () => {
    const { html } = renderDonationThanksEmail();
    expect(html).toContain("100 ans d’existence");
    expect(html).not.toContain("100 ans d'existence");
  });

  it("reprend chaque paragraphe du texte verbatim fourni, tel quel", () => {
    const { html } = renderDonationThanksEmail();
    expect(html).toContain("Chère donatrice, cher donateur,");
    expect(html).toContain("Merci pour votre don aux éditions sociales et à La Dispute.");
    expect(html).toContain(
      "Nous vous tiendrons prochainement informé·es de l’avancée de la campagne et de la manière dont votre soutien nous permet de poursuivre notre travail.",
    );
    expect(html).toContain("Encore merci pour votre confiance et votre solidarité.");
    expect(html).toContain("L’équipe des éditions sociales et de La Dispute");
  });

  it("ne contient aucune salutation ni formule ajoutée (pas de « Bonjour »)", () => {
    const { html } = renderDonationThanksEmail();
    expect(html).not.toContain("Bonjour");
  });

  it("n'affiche aucun récapitulatif de montant (aucune donnée requise au-delà de l'email)", () => {
    const { html } = renderDonationThanksEmail();
    expect(html).not.toMatch(/\d+[,.]\d{2}\s*€/);
    expect(html).not.toContain("RÉCAPITULATIF");
  });

  it("n'affiche pas de bouton CTA marketing (contrairement au mail de commande)", () => {
    const { html } = renderDonationThanksEmail();
    expect(html).not.toContain("Consulter le site");
  });

  it("le pied de page (après la signature) mentionne l'adresse de contact et le domaine", () => {
    const { html } = renderDonationThanksEmail();
    const signatureIndex = html.indexOf("L’équipe des éditions sociales et de La Dispute");
    const contactIndex = html.indexOf("ecrire@editionssociales.fr");
    const domainIndex = html.indexOf("ld-es.fr");
    expect(signatureIndex).toBeGreaterThan(-1);
    expect(contactIndex).toBeGreaterThan(signatureIndex);
    expect(domainIndex).toBeGreaterThan(signatureIndex);
  });
});

describe("selectDonationMailer", () => {
  it("BREVO_API_KEY absente → logDonationMailer", () => {
    expect(selectDonationMailer({})).toBe(logDonationMailer);
  });

  it("BREVO_API_KEY posée → brevoDonationMailer", () => {
    expect(selectDonationMailer({ BREVO_API_KEY: "xkeysib-test" })).toBe(brevoDonationMailer);
  });
});

describe("brevoDonationMailer — envoi réel (msw)", () => {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("poste vers /v3/smtp/email avec le destinataire donateur et le sujet exact", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("https://api.brevo.com/v3/smtp/email", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ messageId: "1" }, { status: 201 });
      }),
    );
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    try {
      await brevoDonationMailer.sendDonationThanks(PAYLOAD);
    } finally {
      delete process.env.BREVO_API_KEY;
      delete process.env.CONTACT_TO_EMAIL;
    }
    expect(capturedBody).toMatchObject({
      to: [{ email: "donatrice@exemple.fr" }],
      subject: "Merci pour votre don",
    });
  });

  it("Brevo indisponible → ne jette jamais (log d'erreur, webhook non bloqué)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.post("https://api.brevo.com/v3/smtp/email", () => HttpResponse.error()));
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    try {
      await expect(brevoDonationMailer.sendDonationThanks(PAYLOAD)).resolves.toBeUndefined();
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
      await expect(brevoDonationMailer.sendDonationThanks(PAYLOAD)).resolves.toBeUndefined();
    } finally {
      delete process.env.BREVO_API_KEY;
      warn.mockRestore();
    }
  });
});
