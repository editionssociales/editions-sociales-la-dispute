/**
 * État du formulaire contact — hors fichier `"use server"` : Next n'autorise
 * que des `async function` en export d'un module actions (sinon
 * `invalid-use-server-value` à l'invocation de N'IMPORTE quelle server action
 * du déploiement, panier et souscription inclus).
 */

import type { MailtoLink } from "@/lib/contact-address";

/** Champ fautif d'un refus — pose `aria-invalid`/`aria-describedby` (`contact-form.tsx`). */
export type ContactField = "name" | "email" | "subject" | "message";

export interface ContactFormState {
  status: "idle" | "ok" | "error";
  message: string | null;
  field?: ContactField;
  /**
   * Chemin manuel proposé quand l'envoi a ÉCHOUÉ (Brevo injoignable, non
   * configuré, destinataire absent) — `mailto:` construit côté serveur AVEC
   * le message déjà saisi (objet + corps), pour que personne ne reperde ce
   * qu'il vient d'écrire. Posé sur le même canal que le reste de l'état,
   * jamais sur un canal parallèle : le formulaire ne lit qu'un objet.
   *
   * Absent sur un refus de VALIDATION (le message n'a pas de forme
   * exploitable) et sur un succès.
   */
  fallback?: MailtoLink;
}

export const CONTACT_INITIAL_STATE: ContactFormState = { status: "idle", message: null };
