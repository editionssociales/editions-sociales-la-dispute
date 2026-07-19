import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrevoResult } from "@/lib/brevo";

/**
 * Composition de la server action : `@/lib/brevo` mocké en bloc (déjà couvert
 * par `brevo.test.ts`, même traitement que `@/lib/commerce-source` dans
 * `panier/actions.test.ts`) — ce fichier ne revérifie que la COMPOSITION
 * (routage honeypot/délai/email invalide → aucun appel Brevo, réponse
 * générique identique au succès ; email valide → appel avec les bons
 * paramètres).
 */

const { getMockHost, setMockHost } = vi.hoisted(() => {
  let host = "preview.test";
  return { getMockHost: () => host, setMockHost: (h: string) => { host = h; } };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: getMockHost() }),
}));

const sendDoiConfirmation = vi.fn(async (): Promise<BrevoResult> => ({ ok: true }));
vi.mock("@/lib/brevo", () => ({ sendDoiConfirmation }));

const { subscribeToNewsletter } = await import("./actions");
const { NEWSLETTER_INITIAL_STATE } = await import("./state");

const form = (entries: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

afterEach(() => {
  sendDoiConfirmation.mockClear();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  setMockHost("preview.test");
});

describe("subscribeToNewsletter — honeypot / délai (aucun appel Brevo)", () => {
  it("honeypot rempli → réponse générique de succès, aucun appel Brevo", async () => {
    const state = await subscribeToNewsletter(
      NEWSLETTER_INITIAL_STATE,
      form({ email: "test@exemple.fr", website: "http://spam.example" }),
    );
    expect(state.status).toBe("ok");
    expect(sendDoiConfirmation).not.toHaveBeenCalled();
  });

  it("soumission trop rapide → réponse générique de succès, aucun appel Brevo", async () => {
    const renderedAt = Date.now();
    const state = await subscribeToNewsletter(
      NEWSLETTER_INITIAL_STATE,
      form({ email: "test@exemple.fr", renderedAt: String(renderedAt) }),
    );
    expect(state.status).toBe("ok");
    expect(sendDoiConfirmation).not.toHaveBeenCalled();
  });
});

describe("subscribeToNewsletter — email invalide", () => {
  it("email malformé → message distinct, aucun appel Brevo", async () => {
    const state = await subscribeToNewsletter(
      NEWSLETTER_INITIAL_STATE,
      form({ email: "pas-un-email" }),
    );
    expect(state).toEqual({
      status: "error",
      message: "Adresse email invalide.",
      field: "email",
    });
    expect(sendDoiConfirmation).not.toHaveBeenCalled();
  });
});

describe("subscribeToNewsletter — soumission valide", () => {
  it("appelle sendDoiConfirmation avec l'email normalisé, la redirection et SOURCE=site-2026", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.exemple.test";
    const state = await subscribeToNewsletter(
      NEWSLETTER_INITIAL_STATE,
      form({ email: "  Test@Exemple.FR  " }),
    );
    expect(state.status).toBe("ok");
    expect(sendDoiConfirmation).toHaveBeenCalledWith({
      email: "test@exemple.fr",
      redirectionUrl: "https://www.exemple.test/newsletter/confirmation",
      source: "site-2026",
    });
  });

  it("Brevo échoue → message d'erreur générique (pas de détail exposé)", async () => {
    sendDoiConfirmation.mockResolvedValueOnce({ ok: false, reason: "not-configured" });
    const state = await subscribeToNewsletter(
      NEWSLETTER_INITIAL_STATE,
      form({ email: "test@exemple.fr" }),
    );
    expect(state.status).toBe("error");
    expect(state.message).not.toMatch(/not-configured/);
  });
});

describe("subscribeToNewsletter — origine de redirectionUrl (liste blanche de hosts)", () => {
  it("host hors liste blanche (en-tête spoofable) → repli sur le domaine canonique, jamais le host brut", async () => {
    setMockHost("attacker.example");
    await subscribeToNewsletter(NEWSLETTER_INITIAL_STATE, form({ email: "test@exemple.fr" }));
    expect(sendDoiConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectionUrl: "https://editionssociales.fr/newsletter/confirmation",
      }),
    );
  });

  it("host qui se termine par le domaine sans en être un sous-domaine (contournement de suffixe) → repli sur le domaine canonique", async () => {
    setMockHost("evileditionssociales.fr");
    await subscribeToNewsletter(NEWSLETTER_INITIAL_STATE, form({ email: "test@exemple.fr" }));
    expect(sendDoiConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectionUrl: "https://editionssociales.fr/newsletter/confirmation",
      }),
    );
  });

  it("sous-domaine editionssociales.fr → host de la requête utilisé tel quel", async () => {
    setMockHost("preview.editionssociales.fr");
    await subscribeToNewsletter(NEWSLETTER_INITIAL_STATE, form({ email: "test@exemple.fr" }));
    expect(sendDoiConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectionUrl: "https://preview.editionssociales.fr/newsletter/confirmation",
      }),
    );
  });

  it("preview *.vercel.app → host de la requête utilisé tel quel", async () => {
    setMockHost("editions-sociales-la-dispute-git-feat.vercel.app");
    await subscribeToNewsletter(NEWSLETTER_INITIAL_STATE, form({ email: "test@exemple.fr" }));
    expect(sendDoiConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectionUrl: "https://editions-sociales-la-dispute-git-feat.vercel.app/newsletter/confirmation",
      }),
    );
  });

  it("localhost (dev, avec port) → host de la requête utilisé tel quel", async () => {
    setMockHost("localhost:3000");
    await subscribeToNewsletter(NEWSLETTER_INITIAL_STATE, form({ email: "test@exemple.fr" }));
    expect(sendDoiConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ redirectionUrl: "https://localhost:3000/newsletter/confirmation" }),
    );
  });

  it("NEXT_PUBLIC_SITE_URL posée → toujours prioritaire, host ignoré même hors liste blanche", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.exemple.test";
    setMockHost("attacker.example");
    const state = await subscribeToNewsletter(
      NEWSLETTER_INITIAL_STATE,
      form({ email: "  Test@Exemple.FR  " }),
    );
    expect(state.status).toBe("ok");
    expect(sendDoiConfirmation).toHaveBeenCalledWith({
      email: "test@exemple.fr",
      redirectionUrl: "https://www.exemple.test/newsletter/confirmation",
      source: "site-2026",
    });
  });
});
