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
import { formatPrice } from "./format";

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function euros(amount: number): string {
  return formatPrice(amount) ?? `${amount.toFixed(2)} €`;
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
 * [À COMPLÉTER : texte définitif du mail de confirmation de commande —
 * habillage, ton éditorial, mentions complémentaires — à valider par le
 * client ; la structure et les données ci-dessous sont fonctionnelles et
 * exactes en attendant.]
 */
export function renderOrderConfirmationEmail(payload: OrderMailPayload): {
  subject: string;
  html: string;
} {
  const rows = payload.lines
    .map(
      (line) =>
        `<tr><td style="padding:4px 8px;">${escapeHtml(line.titleSnapshot)}</td>` +
        `<td style="padding:4px 8px;text-align:center;">${line.quantity}</td>` +
        `<td style="padding:4px 8px;text-align:right;">${euros(line.unitPriceTTC)}</td></tr>`,
    )
    .join("");

  const html =
    `<div style="font-family:sans-serif;color:#111;">` +
    `<p>Bonjour,</p>` +
    `<p>Votre commande <strong>${escapeHtml(payload.orderNumber)}</strong> est confirmée. Voici son récapitulatif :</p>` +
    `<table style="border-collapse:collapse;width:100%;">` +
    `<thead><tr><th style="text-align:left;padding:4px 8px;">Article</th>` +
    `<th style="padding:4px 8px;">Qté</th><th style="text-align:right;padding:4px 8px;">Prix</th></tr></thead>` +
    `<tbody>${rows}</tbody>` +
    `</table>` +
    `<p>Livraison : ${euros(payload.shippingCostTTC)}<br/>` +
    (payload.discountTTC > 0 ? `Remise : -${euros(payload.discountTTC)}<br/>` : "") +
    `Total TTC (TVA 5,5 % incluse) : <strong>${euros(payload.totalTTC)}</strong></p>` +
    `<p>Merci de votre confiance.<br/>Les Éditions sociales × La Dispute</p>` +
    `</div>`;

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
