/**
 * Enveloppe HTML partagée des e-mails transactionnels (commande, don) — DA
 * brutaliste rejouée en dur (`order-mail.ts`, plan §4 étape 9/§5) : tables +
 * styles inline uniquement, aucune CSS externe ni webfont (aucun client mail
 * ne les charge de façon fiable), zéro `border-radius`. Un seul endroit
 * possède le doctype/tête/enveloppe de page/en-tête monogrammes ES/LD +
 * wordmark ; chaque mail ne fournit que son titre et le HTML de son corps
 * (déjà assemblé en lignes `<tr><td>…</td></tr>`).
 *
 * Module PUR (aucune I/O) : mêmes teintes que `globals.css` (brutalisme
 * R1-R8) — `ink` littéral (jamais `#000`), `paper` littéral (jamais
 * `#fff`/`white`).
 */

export const PAPER = "#faf7f2";
export const INK = "#17140f";
export const LINE_COLOR = "#e4ded1";
export const MUTED = "#5c574c";
export const NAVY = "#262a5c";
export const BRICK = "#a8422b";
/** Aucun client mail ne charge une webfont de façon fiable : pile système seule. */
export const FONT_STACK = "ui-sans-serif, system-ui, sans-serif";
/** Domaine canonique — littéral : ces modules restent purs (aucune I/O), donc pas de lecture de `NEXT_PUBLIC_SITE_URL`/requête entrante ici. */
export const SITE_URL = "https://ld-es.fr";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Monogramme carré d'en-tête — même recette que `MaisonMonogramLink` (`site-header.tsx`) : fond accent maison, sigle en `paper`, extrabold italique. */
export function monogramCell(sigle: string, background: string): string {
  return (
    `<td width="44" height="44" style="width:44px;height:44px;background-color:${background};` +
    `font-family:${FONT_STACK};font-size:15px;font-weight:800;font-style:italic;color:${PAPER};` +
    `text-align:center;vertical-align:middle;">${sigle}</td>`
  );
}

/** En-tête commun : monogrammes ES/LD + wordmark. */
function headerRow(): string {
  return (
    `<tr><td style="padding-bottom:24px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    monogramCell("ES", NAVY) +
    `<td width="2"></td>` +
    monogramCell("LD", BRICK) +
    `<td style="padding-left:12px;font-family:${FONT_STACK};font-size:13px;font-weight:800;` +
    `font-style:italic;letter-spacing:0.02em;color:${INK};">` +
    `LES ÉDITIONS SOCIALES × LA DISPUTE</td>` +
    `</tr></table>` +
    `</td></tr>`
  );
}

export interface MailShellOptions {
  /** Contenu de `<title>` — texte brut, jamais affiché dans le corps du message. */
  documentTitle: string;
  /** Préheader masqué : résumé lu en aperçu par les clients mail (liste des messages), jamais affiché dans le corps du message lui-même. */
  preheader: string;
  /** Titre visible en haut du corps (majuscules, gras — même recette que « COMMANDE CONFIRMÉE »). */
  heading: string;
  /** HTML du corps, déjà assemblé en lignes `<tr><td>…</td></tr>` — inséré tel quel après le titre. */
  bodyHtml: string;
}

/**
 * Enveloppe complète d'un e-mail transactionnel — doctype, tête, préheader
 * masqué, en-tête de marque, titre visible, puis le corps fourni par
 * l'appelant. Contrainte clients mail réels : tables + styles inline
 * uniquement, largeur max ~560px centrée.
 */
export function renderMailShell({ documentTitle, preheader, heading, bodyHtml }: MailShellOptions): string {
  return (
    `<!doctype html>` +
    `<html lang="fr">` +
    `<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />` +
    `<title>${escapeHtml(documentTitle)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:${PAPER};">` +
    `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">` +
    preheader +
    `</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAPER};">` +
    `<tr><td align="center" style="padding:24px 16px;">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">` +
    headerRow() +
    `<tr><td style="padding-bottom:12px;font-family:${FONT_STACK};font-size:22px;font-weight:800;` +
    `color:${INK};">${escapeHtml(heading)}</td></tr>` +
    bodyHtml +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body></html>`
  );
}
