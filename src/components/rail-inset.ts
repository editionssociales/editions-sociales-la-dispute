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
 *
 * Depuis le 2026-08-19 le rail est un TIROIR : à partir de `lg` il s'ouvre et
 * se ferme (`souscription/_components/tiers-drawer.tsx`), exactement comme la
 * feuille de bas d'écran sous `lg`. La largeur n'est donc plus une constante
 * mais `380px × --rail-open`, où `--rail-open` vaut 1 (ouvert) ou 0 (fermé).
 * La propriété n'est JAMAIS posée côté serveur : son défaut `var(…, 1)` rend
 * le tiroir OUVERT sans JS (fail-open — même doctrine que les Métriques). La
 * colonne vaut donc 380px ou 0, jamais autre chose : aucune poignée n'est
 * logée dedans (elles sont fixées au bord du viewport).
 */

/**
 * Propriété custom qui porte l'ouverture du tiroir : `1` ouvert, `0` fermé,
 * posée sur `document.documentElement` par le tiroir (client) — jamais rendue
 * dans le HTML serveur. Absente, le `var(--rail-open,1)` des classes
 * ci-dessous retombe sur 1 : OUVERT.
 */
export const RAIL_OPEN_PROPERTY = "--rail-open";

/** Largeur de la colonne du rail (380px ouvert, 0 fermé) — navbar resserrée d'autant sur /souscription. */
export const RAIL_WIDTH_CLASS = "lg:mr-[calc(380px*var(--rail-open,1))]";

/** Grille de page à deux colonnes (contenu + rail) — même largeur que `RAIL_WIDTH_CLASS`. */
export const RAIL_GRID_CLASS = "lg:grid-cols-[minmax(0,1fr)_calc(380px*var(--rail-open,1))]";

/**
 * Largeur FIXE du contenu du tiroir (`tiers-rail.tsx`) — la colonne se
 * referme, le contenu ne se recompose JAMAIS : la géométrie interne du
 * panneau (donc la mesure d'une ancre) est identique ouverte et fermée.
 */
export const RAIL_CONTENT_WIDTH_CLASS = "lg:w-[380px]";

/**
 * Course d'ouverture/fermeture — MÊME durée et MÊME courbe que la feuille de
 * bas d'écran (`bottom-sheet.tsx`, easeInOutCubic symétrique 540 ms) : la
 * feuille mobile et le tiroir desktop sont UN SEUL geste, pas deux. Elle est
 * portée par TOUS les consommateurs de la largeur — la grille de page
 * (`RAIL_GRID_TRANSITION_CLASS`) ET la réserve du header
 * (`RAIL_INSET_TRANSITION_CLASS`) —, sinon la marge du header saute
 * instantanément pendant que la colonne glisse. `RAIL_EDGE_TRANSITION_CLASS`
 * fait voyager les commandes fixées au bord droit (poignée, fermeture, liseré
 * d'appel) sur la même course.
 */
export const RAIL_GRID_TRANSITION_CLASS =
  "lg:transition-[grid-template-columns] lg:duration-[540ms] lg:ease-[cubic-bezier(0.65,0,0.35,1)]";
export const RAIL_INSET_TRANSITION_CLASS =
  "lg:transition-[margin-right] lg:duration-[540ms] lg:ease-[cubic-bezier(0.65,0,0.35,1)]";
export const RAIL_EDGE_TRANSITION_CLASS =
  "lg:transition-transform lg:duration-[540ms] lg:ease-[cubic-bezier(0.65,0,0.35,1)]";

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
