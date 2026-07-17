/**
 * Validation pure de l'inscription newsletter (plan §5 étape 6) — email,
 * honeypot, délai anti-bot best-effort. Sans I/O (convention `src/lib/CLAUDE.md`) :
 * ce module décide, l'appelant (server action) agit (appel Brevo, log).
 *
 * Anti-abus **sans jeton signé serveur** — la cellule newsletter vit dans le
 * pied de page de pages statiques/ISR : un timestamp émis au rendu daterait
 * du rendu ISR (jusqu'à 3600 s de décalage), pas de la visite réelle, et ne
 * contrôlerait rien. À la place : un timestamp généré CÔTÉ CLIENT au montage
 * de l'îlot (`renderedAt`, `Date.now()`), best-effort — et STRICTEMENT
 * best-effort : ce n'est qu'un champ caché de formulaire, un POST scripté
 * (curl, script Python…) peut lui donner N'IMPORTE QUELLE valeur — y compris
 * une largement antérieure à l'envoi — SANS exécuter la moindre ligne de JS.
 * Ce délai ne filtre donc que les bots NAÏFS qui postent instantanément sans
 * se soucier de falsifier ce champ ; un bot qui le falsifie (ou l'omet
 * délibérément, ce qui retombe sur le comportement "non vérifiable", ni
 * pénalisé ni favorisé, cf. `validateNewsletterSubmission`) passe au travers.
 * Le honeypot reste donc la défense PRINCIPALE contre un abus volontaire ;
 * ce délai n'est qu'un filtre d'appoint contre les bots les plus rudimentaires.
 */

/** Emails RFC 5321 : 254 caractères max. */
const MAX_EMAIL_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Délai minimal (ms) entre le montage du formulaire et sa soumission — filtre les bots naïfs qui postent instantanément. */
export const MIN_SUBMIT_DELAY_MS = 1500;

export interface NewsletterSubmissionInput {
  email: string;
  /** Champ caché du formulaire — doit rester vide ; rempli = bot qui remplit tout ce qu'il trouve. */
  honeypot?: string;
  /** `Date.now()` au montage de l'îlot client, transmis en champ caché — absent (JS désactivé) = délai non vérifiable, ni pénalisé ni favorisé. */
  renderedAt?: number;
  /** Horodatage serveur de la soumission — injectable en test, `Date.now()` par défaut. */
  submittedAt?: number;
}

export type NewsletterValidationResult =
  | { ok: true; email: string }
  | { ok: false; reason: "honeypot" | "invalid-email" | "too-fast" };

/**
 * Normalise (trim + minuscule) et valide un email, vérifie l'absence de
 * remplissage du honeypot, et — quand `renderedAt` est fourni — le délai
 * minimal anti-bot. Ne jette jamais.
 */
export function validateNewsletterSubmission(
  input: NewsletterSubmissionInput,
): NewsletterValidationResult {
  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") {
    return { ok: false, reason: "honeypot" };
  }

  const email = input.email.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return { ok: false, reason: "invalid-email" };
  }

  if (typeof input.renderedAt === "number" && Number.isFinite(input.renderedAt)) {
    const submittedAt = input.submittedAt ?? Date.now();
    if (submittedAt - input.renderedAt < MIN_SUBMIT_DELAY_MS) {
      return { ok: false, reason: "too-fast" };
    }
  }

  return { ok: true, email };
}
