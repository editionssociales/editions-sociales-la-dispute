/**
 * État du formulaire contact — hors fichier `"use server"` : Next n'autorise
 * que des `async function` en export d'un module actions (sinon
 * `invalid-use-server-value` à l'invocation de N'IMPORTE quelle server action
 * du déploiement, panier et souscription inclus).
 */

/** Champ fautif d'un refus — pose `aria-invalid`/`aria-describedby` (`contact-form.tsx`). */
export type ContactField = "name" | "email" | "subject" | "message";

export interface ContactFormState {
  status: "idle" | "ok" | "error";
  message: string | null;
  field?: ContactField;
}

export const CONTACT_INITIAL_STATE: ContactFormState = { status: "idle", message: null };
