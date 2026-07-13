import { lexicalToHtml } from "./catalogue-pg-map";
import { cmsExcerpt, sanitizeCms, type SafeHtml } from "./cms-html";
import type { PagesLegales } from "@/payload-types";

/**
 * Cœur pur de l'« éditeur de contenus » (spec du 13/07) : fusion des globals
 * Payload « Contenus du site » avec les textes actuels codés en dur, extraits
 * ici en constantes par défaut. Contrat (pattern Highlight généralisé) :
 * global absent, document jamais sauvegardé ou champ vide ⇒ la valeur par
 * défaut — la page rend alors **exactement** son JSX actuel (iso-rendu
 * strict). Aucun seed des défauts dans Payload : ils ne vivent qu'ici.
 *
 * Module pur, sans I/O — testé par `site-content-core.test.ts` ; la lecture
 * Local API vit dans `site-content.ts` (server-only), même découpage que
 * `donations.ts`/`donations-core.ts`.
 */

/**
 * Rend un champ richText lexical en `SafeHtml`, ou `null` si le champ est
 * vide. Même chaîne que la fiche livre : lexical → HTML brut
 * (`lexicalToHtml`) → `sanitizeCms` (unique fabricant de `SafeHtml`).
 * Un éditeur ouvert puis laissé vide produit `<p></p>` : sans texte ni
 * image, le champ compte comme vide — la page garde son rendu par défaut.
 */
export function richTextToSafeHtml(data: unknown): SafeHtml | null {
  const html = lexicalToHtml(data);
  if (!html) return null;
  const safe = sanitizeCms(html);
  if (!cmsExcerpt(safe) && !/<img\b/i.test(safe)) return null;
  return safe;
}

/* ------------------------------------------------------------------ */
/* Pages légales (lot 1)                                               */
/* ------------------------------------------------------------------ */

/**
 * Corps éditables des trois pages légales — `null` = onglet vide, la page
 * rend son JSX en dur (chapeau et sections actuels, placeholders compris).
 */
export interface PagesLegalesContent {
  cgv: SafeHtml | null;
  mentionsLegales: SafeHtml | null;
  confidentialite: SafeHtml | null;
}

/** Fusion du global `pages-legales` — champ par champ, `null` = défaut dur. */
export function mergePagesLegales(
  global: PagesLegales | null | undefined,
): PagesLegalesContent {
  return {
    cgv: richTextToSafeHtml(global?.cgv),
    mentionsLegales: richTextToSafeHtml(global?.mentionsLegales),
    confidentialite: richTextToSafeHtml(global?.confidentialite),
  };
}
