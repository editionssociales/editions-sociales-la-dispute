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

const { CONTACT_INITIAL_STATE, sendContactMessage } = await import("./actions");

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
