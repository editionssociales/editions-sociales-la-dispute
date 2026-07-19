/**
 * État du formulaire newsletter — hors fichier `"use server"` : Next n'autorise
 * que des `async function` en export d'un module actions (sinon
 * `invalid-use-server-value` à l'invocation de N'IMPORTE quelle server action
 * du déploiement, panier et souscription inclus).
 */

export interface NewsletterFormState {
  status: "idle" | "ok" | "error";
  message: string | null;
  /** Posé uniquement quand l'échec porte sur le champ email (adresse invalide). */
  field?: "email";
}

export const NEWSLETTER_INITIAL_STATE: NewsletterFormState = { status: "idle", message: null };
