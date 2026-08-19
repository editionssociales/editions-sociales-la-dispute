"use server";

import { sendTransactionalEmail } from "@/lib/brevo";
import { buildMailto } from "@/lib/contact-address";
import { validateContactSubmission, type ContactSubmission } from "@/lib/contact-form";
import type { ContactFormState } from "./state";

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
 *
 * Types / état initial : `./state` — un fichier `"use server"` ne peut
 * exporter que des async functions.
 */

const OK_MESSAGE =
  "Merci, votre message a bien été envoyé. Nous vous répondrons dès que possible.";
/**
 * Échec d'envoi — jamais un « une erreur est survenue » sec : le message est
 * écrit, il ne doit pas mourir ici. Le texte annonce le chemin manuel que
 * `fallback` rend cliquable (`state.ts`), avec la saisie déjà dedans.
 */
const GENERIC_ERROR_MESSAGE =
  "Votre message n'a pas pu être envoyé depuis le site. Il n'est pas perdu : envoyez-le-nous directement par e-mail, il est déjà pré-rempli.";

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

  // Chemin manuel armé UNE fois pour tous les échecs d'envoi : le message
  // validé (objet + corps) part dans le `mailto:` de l'adresse publique, et
  // `buildMailto` tronque proprement le corps plutôt que de produire une URL
  // que le client de messagerie refuserait.
  const fallback = buildMailto({ subject: result.subject, body: result.message });

  const to = process.env.CONTACT_TO_EMAIL;
  if (!to) {
    console.warn("[contact] CONTACT_TO_EMAIL absente — envoi ignoré (dégradation propre).");
    return { status: "error", message: GENERIC_ERROR_MESSAGE, fallback };
  }

  const outcome = await sendTransactionalEmail({
    to,
    subject: `[Contact site] ${result.subject}`,
    html: renderContactEmailHtml(result),
    replyTo: result.email,
    replyToName: result.name,
  });

  if (!outcome.ok) {
    return { status: "error", message: GENERIC_ERROR_MESSAGE, fallback };
  }

  return { status: "ok", message: OK_MESSAGE };
}
