"use server";

import { sendTransactionalEmail } from "@/lib/brevo";
import { validateContactSubmission, type ContactSubmission } from "@/lib/contact-form";

/**
 * Server action de l'îlot `contact-form.tsx` (plan §5 étape 7) — même
 * pattern de surface serveur que `newsletter/actions.ts`
 * (`souscription/actions.ts`, décision étape 5). Destinataire unique
 * `CONTACT_TO_EMAIL`, `replyTo` = adresse du visiteur, expéditeur =
 * `CONTACT_TO_EMAIL` (l'adresse authentifiée du domaine — jamais celle du
 * visiteur, DMARC, cf. `brevo.ts`).
 *
 * Contrairement à la newsletter, un échec de validation N'A PAS besoin de
 * réponse générique anti-énumération (il n'y a pas de liste d'abonnés à
 * protéger ici) — chaque motif de refus a son propre message, utile au
 * visiteur. Seuls honeypot/délai gardent une réponse identique au succès,
 * pour ne pas renseigner un bot sur la détection.
 */

/** Champ fautif d'un refus de validation — pose `aria-invalid`/`aria-describedby` côté formulaire (`contact-form.tsx`). `undefined` pour un échec sans rapport avec un champ précis (honeypot, panne d'envoi). */
export type ContactField = "name" | "email" | "subject" | "message";

export interface ContactFormState {
  status: "idle" | "ok" | "error";
  message: string | null;
  field?: ContactField;
}

export const CONTACT_INITIAL_STATE: ContactFormState = { status: "idle", message: null };

const OK_MESSAGE =
  "Merci, votre message a bien été envoyé. Nous vous répondrons dès que possible.";
const GENERIC_ERROR_MESSAGE =
  "L'envoi est momentanément indisponible. Réessayez dans quelques minutes, ou écrivez-nous directement à l'adresse indiquée ci-dessous.";

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  return typeof value === "string" && value !== "" ? Number(value) : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Corps HTML du mail transactionnel — jamais du HTML éditorial CMS (pas de `sanitizeCms`/`SafeHtml` en jeu, cette chaîne part vers l'API Brevo). */
function renderContactEmailHtml(submission: ContactSubmission): string {
  return (
    `<div style="font-family:sans-serif;color:#111;">` +
    `<p><strong>Nom :</strong> ${escapeHtml(submission.name)}</p>` +
    `<p><strong>Email :</strong> ${escapeHtml(submission.email)}</p>` +
    `<p><strong>Sujet :</strong> ${escapeHtml(submission.subject)}</p>` +
    `<p style="white-space:pre-wrap;">${escapeHtml(submission.message)}</p>` +
    `</div>`
  );
}

export async function sendContactMessage(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const result = validateContactSubmission({
    name: str(formData.get("name")),
    email: str(formData.get("email")),
    subject: str(formData.get("subject")),
    message: str(formData.get("message")),
    honeypot: str(formData.get("website")),
    renderedAt: optionalNumber(formData.get("renderedAt")),
  });

  if (!result.ok) {
    switch (result.reason) {
      case "honeypot":
      case "too-fast":
        // Même réponse que le succès — ne jamais renseigner un bot sur la détection.
        return { status: "ok", message: OK_MESSAGE };
      case "invalid-email":
        return { status: "error", message: "Adresse email invalide.", field: "email" };
      case "name-missing":
        return { status: "error", message: "Merci d'indiquer votre nom.", field: "name" };
      case "name-too-long":
        return { status: "error", message: "Le nom saisi est trop long.", field: "name" };
      case "subject-too-long":
        return { status: "error", message: "Le sujet saisi est trop long.", field: "subject" };
      case "message-too-short":
        return { status: "error", message: "Votre message est trop court.", field: "message" };
      case "message-too-long":
        return { status: "error", message: "Votre message est trop long.", field: "message" };
    }
  }

  const to = process.env.CONTACT_TO_EMAIL;
  if (!to) {
    console.warn("[contact] CONTACT_TO_EMAIL absente — envoi ignoré (dégradation propre).");
    return { status: "error", message: GENERIC_ERROR_MESSAGE };
  }

  const outcome = await sendTransactionalEmail({
    to,
    subject: `[Contact site] ${result.subject}`,
    html: renderContactEmailHtml(result),
    replyTo: result.email,
    replyToName: result.name,
  });

  if (!outcome.ok) {
    return { status: "error", message: GENERIC_ERROR_MESSAGE };
  }

  return { status: "ok", message: OK_MESSAGE };
}
