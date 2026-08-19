/**
 * Email de commande (plan §4 étape 9, branchement Brevo en plan §5) —
 * interface `OrderMailer` posée en phase 4, implémentation Brevo ajoutée en
 * phase 5 (`src/lib/brevo.ts`). Le reçu Stripe natif
 * (`payment_intent_data`/`customer_details`, cf. route checkout) couvre déjà
 * la confirmation du jour J — cette interface ne bloque donc rien, elle
 * enrichit la confirmation.
 *
 * Ne jette JAMAIS : un échec d'envoi ne doit pas faire échouer le webhook
 * (la commande est déjà en base au moment de l'appel) — `logOrderMailer` ne
 * peut de toute façon pas échouer, `brevoOrderMailer` respecte la même
 * garantie (catch interne, jamais de rejet qui remonte, cf.
 * `sendTransactionalEmail` dans `brevo.ts` qui ne jette déjà pas).
 */
import { brevoConfigured, sendTransactionalEmail } from "./brevo";
import { CONTACT_EMAIL } from "./contact-address";
import { formatPrice } from "./format";
import {
  FONT_STACK,
  INK,
  LINE_COLOR,
  MUTED,
  PAPER,
  SITE_URL,
  escapeHtml,
  renderMailShell,
} from "./mail-shell";

export interface OrderMailLine {
  titleSnapshot: string;
  quantity: number;
  /** Euros TTC. */
  unitPriceTTC: number;
}

export interface OrderMailPayload {
  orderNumber: string;
  email: string;
  lines: OrderMailLine[];
  /** Euros TTC. */
  shippingCostTTC: number;
  /** Euros TTC. */
  discountTTC: number;
  /** Euros TTC. */
  totalTTC: number;
}

export interface OrderMailer {
  sendOrderConfirmation(payload: OrderMailPayload): Promise<void>;
}

/**
 * Implémentation LOG uniquement (`console.log`, jamais un throw) — le
 * remplacement par Brevo (phase 5 livrée, `src/lib/brevo.ts`) se fait en ne
 * changeant que cet export, l'appelant (webhook) ne connaît que `OrderMailer`.
 */
export const logOrderMailer: OrderMailer = {
  async sendOrderConfirmation(payload) {
    console.log("[order-mail] confirmation de commande (LOG uniquement — Brevo à venir)", payload);
  },
};

function euros(amount: number): string {
  return formatPrice(amount) ?? `${amount.toFixed(2)} €`;
}

/** Ligne d'article du récapitulatif — titre échappé (contrat verrouillé par `order-mail.test.ts`). */
function lineRow(line: OrderMailLine): string {
  const cell =
    `padding:8px 6px;border-bottom:1px solid ${LINE_COLOR};font-family:${FONT_STACK};` +
    `font-size:14px;color:${INK};`;
  return (
    `<tr>` +
    `<td style="${cell}">${escapeHtml(line.titleSnapshot)}</td>` +
    `<td style="${cell}text-align:center;white-space:nowrap;">${line.quantity}</td>` +
    `<td style="${cell}text-align:right;white-space:nowrap;">${euros(line.unitPriceTTC)}</td>` +
    `</tr>`
  );
}

/** Ligne totalisante (livraison / remise / total) — deux premières colonnes fusionnées. */
function totalsRow(
  label: string,
  value: string,
  opts: { strong?: boolean; topBorder?: boolean } = {},
): string {
  const weight = opts.strong ? "800" : "400";
  const border = opts.topBorder ? `border-top:2px solid ${INK};padding-top:10px;` : "";
  return (
    `<tr>` +
    `<td colspan="2" style="padding:6px 6px 2px;${border}font-family:${FONT_STACK};font-size:14px;` +
    `font-weight:${weight};color:${INK};">${label}</td>` +
    `<td style="padding:6px 6px 2px;${border}font-family:${FONT_STACK};font-size:14px;font-weight:${weight};` +
    `color:${INK};text-align:right;white-space:nowrap;">${value}</td>` +
    `</tr>`
  );
}

/**
 * Rendu HTML du mail de confirmation — pur (aucune I/O), testable
 * indépendamment de l'envoi. Échappe chaque champ texte (`titleSnapshot`
 * vient du catalogue, pas d'un utilisateur, mais rien ne garantit l'absence
 * de `&`/`<` dans un titre) : ce n'est PAS du HTML éditorial CMS (le
 * contrat `sanitizeCms`/`SafeHtml` de `cms-html.ts` ne s'applique pas ici,
 * cette chaîne part directement vers l'API Brevo, jamais vers
 * `dangerouslySetInnerHTML`).
 *
 * Contrainte clients mail réels : tables + styles inline uniquement, aucune
 * CSS externe ni webfont, largeur max ~560px centrée. DA du site rejouée en
 * dur (mêmes teintes que `globals.css`, mêmes monogrammes que
 * `site-header.tsx`) — aucune promesse de délai de livraison (texte
 * volontairement prudent, l'expédition réelle n'est pas pilotée par ce
 * module).
 */
export function renderOrderConfirmationEmail(payload: OrderMailPayload): {
  subject: string;
  html: string;
} {
  const orderNumber = escapeHtml(payload.orderNumber);
  const rows = payload.lines.map(lineRow).join("");
  const totals =
    totalsRow("Livraison", euros(payload.shippingCostTTC)) +
    (payload.discountTTC > 0 ? totalsRow("Remise", `-${euros(payload.discountTTC)}`) : "") +
    totalsRow("Total TTC (TVA 5,5 % incluse)", euros(payload.totalTTC), {
      strong: true,
      topBorder: true,
    });

  const bodyHtml =
    // Corps.
    `<tr><td style="padding-bottom:20px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${INK};">` +
    `Bonjour,<br />` +
    `Nous avons bien reçu votre commande <strong>${orderNumber}</strong>. Merci de votre confiance.` +
    `</td></tr>` +
    // Encadré récapitulatif — bordure 2px ink.
    `<tr><td style="border:2px solid ${INK};padding:16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td colspan="3" style="padding-bottom:12px;font-family:${FONT_STACK};font-size:13px;` +
    `font-weight:800;color:${INK};">RÉCAPITULATIF</td></tr>` +
    `<tr>` +
    `<th align="left" style="padding:0 6px 8px;font-family:${FONT_STACK};font-size:12px;` +
    `font-weight:800;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${INK};">Article</th>` +
    `<th align="center" style="padding:0 6px 8px;font-family:${FONT_STACK};font-size:12px;` +
    `font-weight:800;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${INK};">Qté</th>` +
    `<th align="right" style="padding:0 6px 8px;font-family:${FONT_STACK};font-size:12px;` +
    `font-weight:800;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${INK};">Prix unitaire</th>` +
    `</tr>` +
    rows +
    totals +
    `</table>` +
    `</td></tr>` +
    // Expédition — texte prudent, aucun délai promis.
    `<tr><td style="padding:20px 0 20px;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:${INK};">` +
    `Votre commande est en cours de préparation ; nous vous informerons dès son expédition.` +
    `</td></tr>` +
    // Contact.
    `<tr><td style="padding-bottom:24px;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:${MUTED};">` +
    `Une question sur votre commande ? Écrivez-nous à ` +
    `<a href="mailto:${CONTACT_EMAIL}" style="color:${INK};">${CONTACT_EMAIL}</a> — nous vous répondrons avec plaisir.` +
    `</td></tr>` +
    // CTA — même recette que « Nous soutenir » (`site-header.tsx` : fond ink, texte paper, extrabold italique majuscule).
    `<tr><td style="padding-bottom:20px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="background-color:${INK};">` +
    `<a href="${SITE_URL}" style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};` +
    `font-size:14px;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:0.02em;` +
    `color:${PAPER};text-decoration:none;">Consulter le site</a>` +
    `</td>` +
    `</tr></table>` +
    `</td></tr>` +
    // Pied de page.
    `<tr><td style="padding-top:12px;border-top:1px solid ${LINE_COLOR};font-family:${FONT_STACK};` +
    `font-size:12px;color:${MUTED};">` +
    `Les Éditions sociales × La Dispute` +
    `</td></tr>`;

  const html = renderMailShell({
    documentTitle: "Confirmation de commande",
    preheader: `Votre commande ${orderNumber} est confirmée.`,
    heading: "COMMANDE CONFIRMÉE",
    bodyHtml,
  });

  return { subject: `Confirmation de votre commande ${payload.orderNumber}`, html };
}

/**
 * Implémentation Brevo de `OrderMailer` (plan §5 étape 8/§4 étape 9) — envoie
 * la confirmation via `sendTransactionalEmail` (`brevo.ts`). Ne jette JAMAIS :
 * `sendTransactionalEmail` ne jette déjà pas (catch interne dans `brevo.ts`),
 * ce `try/catch` est un filet de sécurité supplémentaire qui protège la
 * garantie `OrderMailer` de toute évolution future de son implémentation.
 */
export const brevoOrderMailer: OrderMailer = {
  async sendOrderConfirmation(payload) {
    try {
      const { subject, html } = renderOrderConfirmationEmail(payload);
      const result = await sendTransactionalEmail({ to: payload.email, subject, html });
      if (!result.ok) {
        console.error(
          `[order-mail] envoi Brevo échoué pour la commande ${payload.orderNumber} (${result.reason ?? "raison inconnue"}) — jamais bloquant, le reçu Stripe natif reste la confirmation immédiate.`,
        );
      }
    } catch (err) {
      console.error(
        `[order-mail] exception inattendue lors de l'envoi Brevo pour la commande ${payload.orderNumber}`,
        err,
      );
    }
  },
};

/**
 * Sélectionne l'implémentation active : `BREVO_API_KEY` présente → Brevo,
 * sinon `logOrderMailer` (dégradation propre, contrat commun aux deux
 * implémentations : jamais de throw).
 */
export function selectOrderMailer(
  env: Record<string, string | undefined> = process.env,
): OrderMailer {
  return brevoConfigured(env) ? brevoOrderMailer : logOrderMailer;
}
