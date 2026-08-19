/**
 * Email de remerciement de don (souscription 2026, webhook `/api/stripe/webhook`)
 * — même architecture que `order-mail.ts` : module dédié, rendu HTML pur et
 * testable, mailer sélectionné par `brevoConfigured()` (Brevo réel via
 * `sendTransactionalEmail`, sinon log console). Aucune donnée requise au-delà
 * de l'email du donateur — pas de récapitulatif de montant, le reçu Stripe
 * natif (`payment_intent_data`, `souscription/actions.ts`) s'en charge déjà.
 *
 * Ne jette JAMAIS : même garantie que `OrderMailer` — un échec d'envoi ne
 * doit jamais casser le webhook ni le flux commandes.
 *
 * **Limite assumée — pas d'idempotence.** La jauge de dons lit les charges
 * Stripe directement (zéro stockage de dons en base, cf. `donations.ts`) :
 * il n'existe donc aucune ligne où marquer « déjà envoyé », contrairement à
 * `Orders.confirmationSent` côté commande. Un rejeu d'event Stripe (retry
 * réseau, redélivrance manuelle) peut donc renvoyer ce mail une seconde fois
 * au même donateur — best effort assumé, pas un bug à corriger tant que les
 * dons ne sont pas persistés.
 */
import { brevoConfigured, sendTransactionalEmail } from "./brevo";
import { CONTACT_EMAIL } from "./contact-address";
import { FONT_STACK, INK, LINE_COLOR, MUTED, SITE_URL, renderMailShell } from "./mail-shell";

export interface DonationMailPayload {
  email: string;
}

export interface DonationMailer {
  sendDonationThanks(payload: DonationMailPayload): Promise<void>;
}

/**
 * Implémentation LOG uniquement (`console.log`, jamais un throw) — même
 * contrat que `logOrderMailer`.
 */
export const logDonationMailer: DonationMailer = {
  async sendDonationThanks(payload) {
    console.log("[donation-mail] remerciement de don (LOG uniquement — Brevo à venir)", payload);
  },
};

/**
 * Corps du mail — VERBATIM (validé mot à mot par `donation-mail.test.ts`) :
 * n'ajoute ni salutation ni formule, ne retouche ni les apostrophes
 * typographiques ni le point médian inclusif. Le dernier paragraphe est la
 * signature.
 */
const PARAGRAPHS = [
  "Chère donatrice, cher donateur,",
  "Merci pour votre don aux éditions sociales et à La Dispute.",
  "En 2027, nos maisons fêteront leurs 100 ans d’existence. Depuis un siècle, nous publions des livres pour comprendre et transformer le monde : des textes marxistes, des ouvrages de sciences sociales, de critique féministe et de pensée critique. Grâce à vous, cette histoire peut continuer.",
  "Nous vous tiendrons prochainement informé·es de l’avancée de la campagne et de la manière dont votre soutien nous permet de poursuivre notre travail.",
  "Encore merci pour votre confiance et votre solidarité.",
];

const SIGNATURE = "L’équipe des éditions sociales et de La Dispute";

function paragraphRow(text: string, opts: { strong?: boolean } = {}): string {
  const weight = opts.strong ? "font-weight:800;" : "";
  return (
    `<tr><td style="padding-bottom:16px;font-family:${FONT_STACK};font-size:15px;` +
    `line-height:1.6;color:${INK};${weight}">${text}</td></tr>`
  );
}

/**
 * Rendu HTML du mail de remerciement — pur (aucune I/O), aucune donnée
 * variable (pas de nom, pas de montant) donc pas de paramètre. Pas de
 * bouton CTA marketing (contrairement au mail de commande) : le ton du
 * texte est un remerciement, pas une relance. Pied sobre après la
 * signature (adresse de contact + domaine), même recette que
 * `order-mail.ts` sans le bouton « Consulter le site ».
 */
export function renderDonationThanksEmail(): { subject: string; html: string } {
  const bodyHtml =
    PARAGRAPHS.map((p) => paragraphRow(p)).join("") +
    paragraphRow(SIGNATURE, { strong: true }) +
    // Contact — pied sobre, APRÈS la signature, pas de CTA marketing.
    `<tr><td style="padding-bottom:24px;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:${MUTED};">` +
    `Une question ? Écrivez-nous à ` +
    `<a href="mailto:${CONTACT_EMAIL}" style="color:${INK};">${CONTACT_EMAIL}</a>.` +
    `</td></tr>` +
    // Pied de page.
    `<tr><td style="padding-top:12px;border-top:1px solid ${LINE_COLOR};font-family:${FONT_STACK};` +
    `font-size:12px;color:${MUTED};">` +
    `Les Éditions sociales × La Dispute — <a href="${SITE_URL}" style="color:${MUTED};">ld-es.fr</a>` +
    `</td></tr>`;

  const html = renderMailShell({
    documentTitle: "Merci pour votre don",
    preheader: "Merci pour votre don aux éditions sociales et à La Dispute.",
    heading: "MERCI POUR VOTRE DON",
    bodyHtml,
  });

  return { subject: "Merci pour votre don", html };
}

/**
 * Implémentation Brevo de `DonationMailer` — envoie le remerciement via
 * `sendTransactionalEmail` (`brevo.ts`). Ne jette JAMAIS : même garantie que
 * `brevoOrderMailer`.
 */
export const brevoDonationMailer: DonationMailer = {
  async sendDonationThanks(payload) {
    try {
      const { subject, html } = renderDonationThanksEmail();
      const result = await sendTransactionalEmail({ to: payload.email, subject, html });
      if (!result.ok) {
        console.error(
          `[donation-mail] envoi Brevo échoué pour le remerciement de don à ${payload.email} (${result.reason ?? "raison inconnue"}) — jamais bloquant, le reçu Stripe natif reste la confirmation immédiate.`,
        );
      }
    } catch (err) {
      console.error(
        "[donation-mail] exception inattendue lors de l'envoi Brevo du remerciement de don",
        err,
      );
    }
  },
};

/**
 * Sélectionne l'implémentation active : `BREVO_API_KEY` présente → Brevo,
 * sinon `logDonationMailer` (dégradation propre, contrat commun aux deux
 * implémentations : jamais de throw).
 */
export function selectDonationMailer(
  env: Record<string, string | undefined> = process.env,
): DonationMailer {
  return brevoConfigured(env) ? brevoDonationMailer : logDonationMailer;
}
