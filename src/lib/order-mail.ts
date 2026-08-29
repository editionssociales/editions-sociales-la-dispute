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
import { DELIVERY_DELAY_RANGE } from "./delivery-copy";
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

/** Un livre numérique livré avec la commande — lien signé vers `/telechargement/[token]` (client 2026-08-24). */
export interface OrderMailDownload {
  title: string;
  /** URL absolue (les clients mail n'ont pas de base pour un chemin relatif). */
  url: string;
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
  /**
   * `"precommande"` → sujet/en-tête/bandeau dédiés (scission panier, client
   * 2026-08-20) : « Précommande — expédiée à parution » plutôt que le texte
   * de préparation habituel. Absent ou `"commande"` = gabarit historique
   * inchangé (rétrocompatible avec tout appelant qui ne le pose pas).
   */
  orderType?: "commande" | "precommande";
  /**
   * Titres de la commande qui ont un fichier numérique attaché (client
   * 2026-08-24 : « pour les Notes sur Mill, on pouvait télécharger l'epub
   * après achat » — arbitrage « un lien par mail », le site n'a pas de compte
   * client). Absent ou vide = bloc non rendu : la très grande majorité des
   * commandes n'a rien à télécharger.
   */
  downloads?: OrderMailDownload[];
  /**
   * Mention de délai affichée dans la note d'expédition — éditable au
   * back-office (`PagesLegales.livraisonDelai`, batch 3), transmise par
   * l'appelant (`order-handler.ts` via `getPagesLegales()`) : ce module reste
   * PUR (aucune lecture Payload), même patron prop+défaut que
   * `BuyLinksList`/`CartView`. Défaut `DELIVERY_DELAY_RANGE` pour tout
   * appelant qui ne la pose pas (tests compris).
   */
  livraisonDelai?: string;
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
 * `site-header.tsx`) — le délai annoncé (`buildShippingNote`) reprend
 * `payload.livraisonDelai` (éditable au back-office, `PagesLegales.livraisonDelai`,
 * transmis par le webhook), avec `DELIVERY_DELAY_RANGE` en défaut pour tout
 * appelant qui ne le pose pas ; l'expédition réelle n'étant pas pilotée par
 * ce module, la précommande garde sa phrase SANS délai (`PREORDER_NOTE`).
 */
/**
 * Phrases partagées entre les rendus HTML et texte brut — une seule source :
 * toute retouche éditoriale vaut pour les deux formats d'un coup.
 */
const SHIPPING_LABEL = "Livraison";
const DISCOUNT_LABEL = "Remise";
const TOTAL_LABEL = "Total TTC (TVA 5,5 % incluse)";
/** Délai éditable (`payload.livraisonDelai`, défaut `DELIVERY_DELAY_RANGE`) — même patron que `BuyLinksList`/`CartView`. */
function buildShippingNote(livraisonDelai: string): string {
  return (
    `Votre commande est en cours de préparation ; comptez ${livraisonDelai} ` +
    "pour la recevoir. Nous vous informerons dès son expédition."
  );
}
/** Précommande (scission panier, client 2026-08-20) : ne promet pas un délai de préparation qui n'a pas commencé — l'expédition suit la parution, pas la commande. */
const PREORDER_NOTE = "Précommande — expédiée à parution ; nous vous informerons dès son expédition.";
/** En-tête du bloc téléchargement — accordé au nombre de fichiers (une commande peut contenir plusieurs titres numériques). */
const downloadsTitle = (count: number) =>
  count > 1 ? "VOS EXEMPLAIRES NUMÉRIQUES" : "VOTRE EXEMPLAIRE NUMÉRIQUE";
/** Promesse tenable : le lien ne périme pas (cf. `ebook-token.ts`, aucune expiration), et il ne dépend pas d'un compte. */
const DOWNLOADS_NOTE =
  "Ce lien vous est personnel et reste valable : conservez cet e-mail pour retélécharger votre fichier quand vous voulez.";
const isPreorderPayload = (payload: OrderMailPayload) => payload.orderType === "precommande";
const introSentence = (orderNumberMarkup: string, preorder: boolean) =>
  `Nous avons bien reçu votre ${preorder ? "précommande" : "commande"} ${orderNumberMarkup}. Merci de votre confiance.`;
const contactSentence = (emailMarkup: string, preorder: boolean) =>
  `Une question sur votre ${preorder ? "précommande" : "commande"} ? Écrivez-nous à ${emailMarkup} — nous vous répondrons avec plaisir.`;

/**
 * Rendu texte brut (multipart, `textContent`) — mêmes phrases que le HTML
 * (constantes partagées ci-dessus), données non échappées (text/plain).
 * Classification Gmail (un HTML seul part en onglet Promotions) et
 * accessibilité.
 */
function renderOrderConfirmationText(payload: OrderMailPayload): string {
  const preorder = isPreorderPayload(payload);
  const lines = payload.lines
    .map((l) => `- ${l.titleSnapshot} ×${l.quantity} — ${euros(l.unitPriceTTC)}`)
    .join("\n");
  return [
    "Bonjour,",
    introSentence(payload.orderNumber, preorder),
    "RÉCAPITULATIF\n" +
      lines +
      `\n${SHIPPING_LABEL} : ${euros(payload.shippingCostTTC)}` +
      (payload.discountTTC > 0 ? `\n${DISCOUNT_LABEL} : -${euros(payload.discountTTC)}` : "") +
      `\n${TOTAL_LABEL} : ${euros(payload.totalTTC)}`,
    preorder ? PREORDER_NOTE : buildShippingNote(payload.livraisonDelai ?? DELIVERY_DELAY_RANGE),
    ...(payload.downloads?.length
      ? [
          `${downloadsTitle(payload.downloads.length)}\n` +
            payload.downloads.map((d) => `- ${d.title} : ${d.url}`).join("\n") +
            `\n${DOWNLOADS_NOTE}`,
        ]
      : []),
    contactSentence(CONTACT_EMAIL, preorder),
    `Consulter le site : ${SITE_URL}`,
    "Les Éditions sociales × La Dispute",
  ].join("\n\n");
}

export function renderOrderConfirmationEmail(payload: OrderMailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const preorder = isPreorderPayload(payload);
  const orderNumber = escapeHtml(payload.orderNumber);
  const rows = payload.lines.map(lineRow).join("");
  const totals =
    totalsRow(SHIPPING_LABEL, euros(payload.shippingCostTTC)) +
    (payload.discountTTC > 0 ? totalsRow(DISCOUNT_LABEL, `-${euros(payload.discountTTC)}`) : "") +
    totalsRow(TOTAL_LABEL, euros(payload.totalTTC), {
      strong: true,
      topBorder: true,
    });

  const downloads = payload.downloads ?? [];
  const downloadsHtml = downloads.length
    ? `<tr><td style="border:2px solid ${INK};padding:16px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
      `<tr><td style="padding-bottom:12px;font-family:${FONT_STACK};font-size:13px;font-weight:800;color:${INK};">` +
      `${downloadsTitle(downloads.length)}</td></tr>` +
      downloads
        .map(
          (download) =>
            `<tr><td style="padding-bottom:10px;font-family:${FONT_STACK};font-size:14px;line-height:1.5;color:${INK};">` +
            `${escapeHtml(download.title)}<br />` +
            `<a href="${escapeHtml(download.url)}" style="font-weight:800;color:${INK};">Télécharger votre exemplaire</a>` +
            `</td></tr>`,
        )
        .join("") +
      `<tr><td style="font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${MUTED};">${DOWNLOADS_NOTE}</td></tr>` +
      `</table></td></tr>` +
      // Respiration sous l'encadré (les autres blocs portent leur propre padding).
      `<tr><td style="height:20px;line-height:20px;">&nbsp;</td></tr>`
    : "";

  const bodyHtml =
    // Corps.
    `<tr><td style="padding-bottom:20px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${INK};">` +
    `Bonjour,<br />` +
    `Nous avons bien reçu votre ${preorder ? "précommande" : "commande"} <strong>${orderNumber}</strong>. Merci de votre confiance.` +
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
    // Expédition — texte prudent, aucun délai promis. Précommande (client
    // 2026-08-20) : bandeau dédié, jamais le texte de préparation habituel
    // (rien n'est « en préparation » avant la parution).
    `<tr><td style="padding:20px 0 20px;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:${INK};">` +
    (preorder ? PREORDER_NOTE : buildShippingNote(payload.livraisonDelai ?? DELIVERY_DELAY_RANGE)) +
    `</td></tr>` +
    // Livre(s) numérique(s) — encadré à part, APRÈS la note d'expédition :
    // c'est la seule partie de la commande qui est déjà disponible, elle ne
    // doit pas se confondre avec ce qui reste à expédier. Bloc absent quand
    // la commande n'a aucun fichier attaché (cas de la quasi-totalité).
    downloadsHtml +
    // Contact.
    `<tr><td style="padding-bottom:24px;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:${MUTED};">` +
    `Une question sur votre ${preorder ? "précommande" : "commande"} ? Écrivez-nous à ` +
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
    documentTitle: preorder ? "Confirmation de précommande" : "Confirmation de commande",
    preheader: preorder
      ? `Votre précommande ${orderNumber} est confirmée.`
      : `Votre commande ${orderNumber} est confirmée.`,
    heading: preorder ? "PRÉCOMMANDE CONFIRMÉE" : "COMMANDE CONFIRMÉE",
    bodyHtml,
  });

  return {
    subject: preorder
      ? `Confirmation de votre précommande ${payload.orderNumber}`
      : `Confirmation de votre commande ${payload.orderNumber}`,
    html,
    text: renderOrderConfirmationText(payload),
  };
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
      const { subject, html, text } = renderOrderConfirmationEmail(payload);
      const result = await sendTransactionalEmail({
        to: payload.email,
        subject,
        html,
        textContent: text,
      });
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
