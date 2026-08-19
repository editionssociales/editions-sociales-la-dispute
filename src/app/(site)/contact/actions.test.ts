import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrevoResult } from "@/lib/brevo";

/**
 * Composition de la server action : `@/lib/brevo` mocké en bloc (déjà
 * couvert par `brevo.test.ts`) — ce fichier ne revérifie que la COMPOSITION
 * (routage honeypot/délai → réponse générique sans appel Brevo ; validations
 * → message dédié ; soumission valide → appel avec to/replyTo corrects).
 */

const sendTransactionalEmail = vi.fn(async (): Promise<BrevoResult> => ({ ok: true }));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail }));

const { sendContactMessage } = await import("./actions");
const { CONTACT_INITIAL_STATE } = await import("./state");

const VALID = {
  name: "Simone",
  email: "simone@exemple.fr",
  subject: "Question",
  message: "Bonjour, je souhaiterais savoir si ce livre est disponible en librairie près de chez moi.",
};

const form = (entries: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

afterEach(() => {
  sendTransactionalEmail.mockClear();
  delete process.env.CONTACT_TO_EMAIL;
});

describe("sendContactMessage — honeypot / délai (aucun envoi)", () => {
  it("honeypot rempli → réponse générique de succès, aucun envoi", async () => {
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    const state = await sendContactMessage(
      CONTACT_INITIAL_STATE,
      form({ ...VALID, website: "http://spam.example" }),
    );
    expect(state.status).toBe("ok");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("soumission trop rapide → réponse générique de succès, aucun envoi", async () => {
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    const renderedAt = Date.now();
    const state = await sendContactMessage(
      CONTACT_INITIAL_STATE,
      form({ ...VALID, renderedAt: String(renderedAt) }),
    );
    expect(state.status).toBe("ok");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("sendContactMessage — validations, messages dédiés", () => {
  it("email invalide → message dédié", async () => {
    const state = await sendContactMessage(
      CONTACT_INITIAL_STATE,
      form({ ...VALID, email: "pas-un-email" }),
    );
    expect(state).toEqual({
      status: "error",
      message: "Adresse email invalide.",
      field: "email",
    });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("nom manquant → message dédié", async () => {
    const state = await sendContactMessage(CONTACT_INITIAL_STATE, form({ ...VALID, name: " " }));
    expect(state).toEqual({
      status: "error",
      message: "Merci d'indiquer votre nom.",
      field: "name",
    });
  });

  it("message trop court → message dédié", async () => {
    const state = await sendContactMessage(
      CONTACT_INITIAL_STATE,
      form({ ...VALID, message: "court" }),
    );
    expect(state).toEqual({
      status: "error",
      message: "Votre message est trop court.",
      field: "message",
    });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("sendContactMessage — soumission valide", () => {
  it("CONTACT_TO_EMAIL absente → erreur générique, aucun appel réseau", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = await sendContactMessage(CONTACT_INITIAL_STATE, form(VALID));
    expect(state.status).toBe("error");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("envoie à CONTACT_TO_EMAIL, replyTo = expéditeur du formulaire", async () => {
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    const state = await sendContactMessage(CONTACT_INITIAL_STATE, form(VALID));
    expect(state.status).toBe("ok");
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "toutes@editionssociales.fr",
        replyTo: "simone@exemple.fr",
        replyToName: "Simone",
        subject: "[Contact site] Question",
      }),
    );
  });

  it("Brevo échoue → erreur générique, pas de détail exposé", async () => {
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    sendTransactionalEmail.mockResolvedValueOnce({ ok: false, reason: "http-500" });
    const state = await sendContactMessage(CONTACT_INITIAL_STATE, form(VALID));
    expect(state.status).toBe("error");
    expect(state.message).not.toMatch(/http-500/);
  });
});

/**
 * Un échec d'envoi ne doit jamais se solder par « une erreur est survenue » :
 * le message est écrit, il repart par le chemin manuel — déjà pré-rempli.
 */
describe("sendContactMessage — chemin manuel des échecs", () => {
  it("Brevo échoue → mailto vers l'adresse publique, objet ET corps saisis", async () => {
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    sendTransactionalEmail.mockResolvedValueOnce({ ok: false, reason: "network-error" });

    const state = await sendContactMessage(CONTACT_INITIAL_STATE, form(VALID));

    expect(state.fallback?.address).toBe("ecrire@editionssociales.fr");
    expect(state.fallback?.truncated).toBe(false);
    const href = state.fallback?.href ?? "";
    expect(href.startsWith("mailto:ecrire@editionssociales.fr?")).toBe(true);
    expect(decodeURIComponent(href)).toContain(VALID.subject);
    expect(decodeURIComponent(href)).toContain(VALID.message);
  });

  it("CONTACT_TO_EMAIL absente → même chemin manuel (rien n'est parti non plus)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = await sendContactMessage(CONTACT_INITIAL_STATE, form(VALID));

    expect(state.fallback?.href).toContain("mailto:ecrire@editionssociales.fr");
    warn.mockRestore();
  });

  it("message très long → corps tronqué, lien jamais cassé", async () => {
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    sendTransactionalEmail.mockResolvedValueOnce({ ok: false, reason: "http-500" });

    const state = await sendContactMessage(
      CONTACT_INITIAL_STATE,
      form({ ...VALID, message: "Un très long message. ".repeat(200) }),
    );

    expect(state.fallback?.truncated).toBe(true);
    expect((state.fallback?.href ?? "").length).toBeLessThanOrEqual(1800);
  });

  it("succès → aucun chemin manuel (rien à rattraper)", async () => {
    process.env.CONTACT_TO_EMAIL = "toutes@editionssociales.fr";
    const state = await sendContactMessage(CONTACT_INITIAL_STATE, form(VALID));

    expect(state.status).toBe("ok");
    expect(state.fallback).toBeUndefined();
  });

  it("refus de validation → aucun chemin manuel (le message n'a pas de forme exploitable)", async () => {
    const state = await sendContactMessage(
      CONTACT_INITIAL_STATE,
      form({ ...VALID, message: "court" }),
    );

    expect(state.status).toBe("error");
    expect(state.fallback).toBeUndefined();
  });
});
