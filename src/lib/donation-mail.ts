/**
 * Email de remerciement de don (souscription 2026, webhook `/api/stripe/webhook`)
 * — même architecture que `order-mail.ts` : module dédié, rendu HTML + texte
 * brut (multipart, `textContent` — classification Gmail et accessibilité) pur
 * et testable, mailer sélectionné par `brevoConfigured()` (Brevo réel via
 * `sendTransactionalEmail`, sinon log console).
 *
 * `recap` (contreparties, client 2026-08-21) : optionnel — un don SANS
 * contrepartie (montant libre, ou palier antérieur à la feature) reste le
 * mail sobre d'origine, aucun récapitulatif de montant (le reçu Stripe natif,
 * `payment_intent_data`/`souscription/actions.ts`, s'en charge déjà). Un don
 * AVEC contrepartie (`order-handler.ts:handleDonationSessionCompleted`)
 * fournit `recap` : le corps VERBATIM (`PARAGRAPHS`/signature) reste
 * STRICTEMENT identique à l'octet, le récap est un bloc additionnel après.
 *
 * Ne jette JAMAIS : même garantie que `OrderMailer` — un échec d'envoi ne
 * doit jamais casser le webhook ni le flux commandes.
 *
 * **Limite assumée — pas d'idempotence intrinsèque.** La jauge de dons lit
 * les charges Stripe directement (zéro stockage de dons en base, cf.
 * `donations.ts`) : ce module n'a donc lui-même aucune ligne où marquer
 * « déjà envoyé ». Un don SANS contrepartie (chemin `route.ts` legacy) peut
 * ainsi renvoyer ce mail une seconde fois au même donateur sur un rejeu
 * d'event Stripe — best effort assumé. Un don AVEC contrepartie EST
 * idempotent : c'est `handleDonationSessionCompleted` (`order-handler.ts`)
 * qui porte ce marqueur (`Orders.confirmationSent`, comme côté commande),
 * pas ce module.
 */
import { brevoConfigured, sendTransactionalEmail } from "./brevo";
import { CONTACT_EMAIL } from "./contact-address";
import { formatPrice } from "./format";
import { FONT_STACK, INK, LINE_COLOR, MUTED, SITE_URL, escapeHtml, renderMailShell } from "./mail-shell";

/** Adresse de livraison de la contrepartie — mêmes champs que `OrderAddressFacts` (`order-webhook-core.ts`), recopiés ici pour ne pas faire dépendre ce module pur du cœur webhook. */
export interface DonationMailRecapAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode: string;
  city: string;
  country: string;
}

/** Récapitulatif de la contrepartie (palier, composition, adresse) — présent uniquement pour un don qui en porte une (`donLines`, cf. `order-handler.ts`). */
export interface DonationMailRecap {
  tierTitle: string;
  /** Euros — montant du don (pas la valeur des articles, toujours à 0 en contrepartie). */
  amountEuros: number;
  lines: { title: string; quantity: number }[];
  /** Absente en théorie jamais (tous les paliers 2026 collectent une adresse) — optionnelle par défensivité, jamais un bloc adresse inventé. */
  shippingAddress?: DonationMailRecapAddress;
}

export interface DonationMailPayload {
  email: string;
  recap?: DonationMailRecap;
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

function euros(amount: number): string {
  return formatPrice(amount) ?? `${amount.toFixed(2)} €`;
}

/** Lignes d'adresse — mêmes champs dans le même ordre en HTML et en texte brut, jamais réénoncés séparément. */
function addressLines(address: DonationMailRecapAddress): string[] {
  return [
    address.fullName,
    address.addressLine1,
    ...(address.addressLine2 ? [address.addressLine2] : []),
    `${address.postalCode} ${address.city}`,
    address.country,
  ];
}

/**
 * Bloc récap HTML — encadré (même recette que le RÉCAPITULATIF de
 * `order-mail.ts`) : titre du palier, composition (titre × qté), montant du
 * don, puis l'adresse de livraison si fournie. Titres/adresse échappés (même
 * garde que `order-mail.ts:lineRow` — un titre catalogue peut contenir
 * `&`/`<`, cette chaîne part directement vers l'API Brevo).
 */
function recapRow(recap: DonationMailRecap): string {
  const linesHtml = recap.lines
    .map(
      (l) =>
        `<tr><td style="padding:3px 0;font-family:${FONT_STACK};font-size:14px;color:${INK};">` +
        `${escapeHtml(l.title)} × ${l.quantity}</td></tr>`,
    )
    .join("");
  const addressHtml = recap.shippingAddress
    ? `<tr><td style="padding-top:10px;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:${MUTED};">` +
      `Adresse de livraison :<br />` +
      addressLines(recap.shippingAddress).map(escapeHtml).join("<br />") +
      `</td></tr>`
    : "";
  return (
    `<tr><td style="border:2px solid ${INK};padding:16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td style="padding-bottom:10px;font-family:${FONT_STACK};font-size:15px;font-weight:800;color:${INK};">` +
    `Votre contrepartie — ${escapeHtml(recap.tierTitle)}` +
    `</td></tr>` +
    linesHtml +
    `<tr><td style="padding-top:10px;font-family:${FONT_STACK};font-size:13px;color:${MUTED};">` +
    `Montant du don : ${euros(recap.amountEuros)}` +
    `</td></tr>` +
    addressHtml +
    `</table>` +
    `</td></tr>`
  );
}

/** Même bloc que `recapRow`, en texte brut. */
function recapText(recap: DonationMailRecap): string {
  const lines = recap.lines.map((l) => `- ${l.title} ×${l.quantity}`).join("\n");
  const address = recap.shippingAddress
    ? "\n\nAdresse de livraison :\n" + addressLines(recap.shippingAddress).join("\n")
    : "";
  return (
    `Votre contrepartie — ${recap.tierTitle}\n` +
    lines +
    `\nMontant du don : ${euros(recap.amountEuros)}` +
    address
  );
}

/**
 * Rendu texte brut (multipart) — mêmes paragraphes VERBATIM que le HTML
 * (constantes `PARAGRAPHS`/`SIGNATURE`, jamais retapés), séparés par des
 * lignes vides, puis le même pied que le HTML (contact, domaine). Sert deux
 * fins : classification Gmail (un mail HTML seul part en onglet Promotions)
 * et accessibilité (lecteurs texte brut). `recap` (contreparties) : bloc
 * additionnel après les paragraphes/signature, absent par défaut (don sans
 * contrepartie — verbatim inchangé).
 */
function renderDonationThanksText(recap?: DonationMailRecap): string {
  return (
    [...PARAGRAPHS, SIGNATURE].join("\n\n") +
    (recap ? "\n\n" + recapText(recap) : "") +
    "\n\n" +
    `Une question ? Écrivez-nous à ${CONTACT_EMAIL}.` +
    "\n\n" +
    `Les Éditions sociales × La Dispute — ld-es.fr`
  );
}

/**
 * Rendu HTML du mail de remerciement — pur (aucune I/O). Le corps VERBATIM
 * (`PARAGRAPHS`/`SIGNATURE`) ne dépend d'aucun paramètre — un don sans
 * contrepartie (`recap` absent, montant libre ou palier antérieur à la
 * feature) reste STRICTEMENT le mail d'origine. Pas de bouton CTA marketing
 * (contrairement au mail de commande) : le ton du texte est un remerciement,
 * pas une relance. Pied sobre après la signature/le récap (adresse de
 * contact + domaine), même recette que `order-mail.ts` sans le bouton
 * « Consulter le site ».
 */
export function renderDonationThanksEmail(recap?: DonationMailRecap): {
  subject: string;
  html: string;
  text: string;
} {
  const bodyHtml =
    PARAGRAPHS.map((p) => paragraphRow(p)).join("") +
    paragraphRow(SIGNATURE, { strong: true }) +
    // Contrepartie (client 2026-08-21) — bloc additionnel, APRÈS le corps
    // verbatim, jamais entre deux paragraphes.
    (recap ? recapRow(recap) : "") +
    // Contact — pied sobre, APRÈS la signature/le récap, pas de CTA marketing.
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

  return { subject: "Merci pour votre don", html, text: renderDonationThanksText(recap) };
}

/**
 * Implémentation Brevo de `DonationMailer` — envoie le remerciement via
 * `sendTransactionalEmail` (`brevo.ts`). Ne jette JAMAIS : même garantie que
 * `brevoOrderMailer`.
 */
export const brevoDonationMailer: DonationMailer = {
  async sendDonationThanks(payload) {
    try {
      const { subject, html, text } = renderDonationThanksEmail(payload.recap);
      const result = await sendTransactionalEmail({ to: payload.email, subject, html, textContent: text });
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
