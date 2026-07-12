/**
 * Email de commande (plan §4 étape 9) — INTERFACE posée maintenant,
 * implémentation **LOG uniquement** : Brevo (compte provisionné phase 5,
 * `src/lib/brevo.ts`) sera branché séparément. Le reçu Stripe natif
 * (`payment_intent_data`/`customer_details`, cf. route checkout) couvre déjà
 * la confirmation du jour J — cette interface ne bloque donc rien en
 * attendant Brevo, elle documente juste le contrat que l'implémentation
 * réelle devra remplir (mêmes champs que le gabarit prévu : lignes, port,
 * remise, total, adresse de livraison, mention TVA 5,5 % incluse).
 *
 * Ne jette JAMAIS : un échec d'envoi ne doit pas faire échouer le webhook
 * (la commande est déjà en base au moment de l'appel) — l'implémentation LOG
 * ne peut de toute façon pas échouer, la future implémentation Brevo devra
 * respecter la même garantie (catch interne, jamais de rejet qui remonte).
 */

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
