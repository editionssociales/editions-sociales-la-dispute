/**
 * Géométrie partagée du rail des contreparties sur la route /souscription —
 * SOURCE UNIQUE des valeurs qui doivent rester en phase entre trois arbres :
 * la navbar resserrée (`site-header.tsx`, `railInset`), la grille de la page
 * (`souscription/page.tsx`), l'ancrage du rail et le liseré de collecte
 * (`souscription/_components/{tiers-rail,collecte-ticker}.tsx`). Avant ce
 * fichier, les mêmes 380px/10px vivaient en 5 littéraux séparés — une
 * révision de l'une des deux valeurs pouvait désynchroniser les autres sans
 * qu'aucun outil ne le signale.
 *
 * Classes Tailwind LITTÉRALES uniquement (contrat JIT — le compilateur ne
 * résout pas `lg:mr-[${W}px]` construit dynamiquement) : une largeur qui
 * bouge se change ICI, une seule ligne par constante, jamais en reconstruisant
 * la classe à l'appelant. Fichier plat, sans `"use client"` — précédent du
 * dépôt : `nav-accent.ts`, importable aussi bien du header (client) que d'une
 * page ou d'un module colocalisé serveur.
 */

/** Largeur de la colonne du rail (380px) — navbar resserrée d'autant sur /souscription. */
export const RAIL_WIDTH_CLASS = "lg:mr-[380px]";

/** Grille de page à deux colonnes (contenu + rail) — même largeur que `RAIL_WIDTH_CLASS`. */
export const RAIL_GRID_CLASS = "lg:grid-cols-[minmax(0,1fr)_380px]";

/** Hauteur du liseré de collecte fixé en haut du viewport — `collecte-ticker.tsx`. */
export const TICKER_HEIGHT_CLASS = "h-[10px]";

/**
 * Réserve interne du header pour le liseré (boîte sticky, `site-header.tsx`)
 * — même valeur que `TICKER_HEIGHT_CLASS`, exprimée en `pt` plutôt qu'en `h`.
 */
export const HEADER_TICKER_RESERVE_CLASS = "pt-[10px]";

/** Ancrage du rail sous le liseré (`tiers-rail.tsx`, `lg:sticky`) — même valeur que `TICKER_HEIGHT_CLASS`. */
export const TICKER_INSET_CLASS = "lg:top-[10px]";

/** Plafond de hauteur du rail : le viewport moins la même réserve que ci-dessus. */
export const RAIL_MAX_HEIGHT_CLASS = "lg:max-h-[calc(100vh_-_10px)]";
