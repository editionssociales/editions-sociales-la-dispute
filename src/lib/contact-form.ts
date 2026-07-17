/**
 * Validation pure du formulaire de contact unique `/contact` (plan §5 étape
 * 7) — un seul destinataire, sujet libre (défaut recommandé du plan, §Calage
 * calendrier : « réduire /contact à sa forme minimale »). Sans I/O (convention
 * `src/lib/CLAUDE.md`).
 *
 * Mêmes protections anti-abus que `newsletter.ts` (honeypot + délai
 * best-effort côté client, sans jeton signé serveur — mêmes raisons : page
 * statique/ISR) + des bornes de longueur sur les champs texte. Même limite
 * aussi : le délai ne repose que sur un champ caché de formulaire (`renderedAt`)
 * qu'un POST scripté peut falsifier sans exécuter de JS — il ne filtre donc
 * que les bots naïfs qui ne le falsifient pas, le honeypot restant la
 * défense principale (détail cf. `newsletter.ts`).
 */

const MAX_EMAIL_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NAME_MAX_LENGTH = 200;
export const SUBJECT_MAX_LENGTH = 200;
export const MESSAGE_MIN_LENGTH = 10;
export const MESSAGE_MAX_LENGTH = 5000;
export const DEFAULT_SUBJECT = "Message du site";

/** Délai minimal (ms) entre le montage du formulaire et sa soumission — même seuil que `newsletter.ts`, module indépendant à dessein (pas de couplage entre les deux domaines de formulaire). */
export const MIN_SUBMIT_DELAY_MS = 1500;

export interface ContactSubmissionInput {
  name: string;
  email: string;
  subject?: string;
  message: string;
  /** Champ caché du formulaire — doit rester vide ; rempli = bot. */
  honeypot?: string;
  /** `Date.now()` au montage de l'îlot client — absent (JS désactivé) = délai non vérifiable, ni pénalisé ni favorisé. */
  renderedAt?: number;
  /** Horodatage serveur de la soumission — injectable en test, `Date.now()` par défaut. */
  submittedAt?: number;
}

export interface ContactSubmission {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export type ContactValidationResult =
  | ({ ok: true } & ContactSubmission)
  | {
      ok: false;
      reason:
        | "honeypot"
        | "too-fast"
        | "invalid-email"
        | "name-missing"
        | "name-too-long"
        | "subject-too-long"
        | "message-too-short"
        | "message-too-long";
    };

/**
 * Valide nom/email/sujet/message + honeypot + délai anti-bot. Ne jette
 * jamais ; `subject` retombe sur `DEFAULT_SUBJECT` si absent ou vide (sujet
 * libre, pas de routage par thème — décision du plan, question ouverte n°6,
 * défaut retenu).
 */
export function validateContactSubmission(
  input: ContactSubmissionInput,
): ContactValidationResult {
  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") {
    return { ok: false, reason: "honeypot" };
  }

  if (typeof input.renderedAt === "number" && Number.isFinite(input.renderedAt)) {
    const submittedAt = input.submittedAt ?? Date.now();
    if (submittedAt - input.renderedAt < MIN_SUBMIT_DELAY_MS) {
      return { ok: false, reason: "too-fast" };
    }
  }

  const email = input.email.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return { ok: false, reason: "invalid-email" };
  }

  const name = input.name.trim();
  if (name.length === 0) return { ok: false, reason: "name-missing" };
  if (name.length > NAME_MAX_LENGTH) return { ok: false, reason: "name-too-long" };

  const subjectRaw = input.subject?.trim() ?? "";
  if (subjectRaw.length > SUBJECT_MAX_LENGTH) return { ok: false, reason: "subject-too-long" };
  const subject = subjectRaw.length > 0 ? subjectRaw : DEFAULT_SUBJECT;

  const message = input.message.trim();
  if (message.length < MESSAGE_MIN_LENGTH) return { ok: false, reason: "message-too-short" };
  if (message.length > MESSAGE_MAX_LENGTH) return { ok: false, reason: "message-too-long" };

  return { ok: true, name, email, subject, message };
}
