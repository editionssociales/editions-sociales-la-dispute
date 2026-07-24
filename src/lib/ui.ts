/**
 * Primitives de classes de l'UI brutaliste — définies une fois, littérales (le
 * JIT Tailwind ne compile pas les classes concaténées dynamiquement).
 */

/**
 * Deux anneaux de focus, jamais un troisième recréé à la main (R5) — le
 * pop-yellow n'a de contraste réel que sur fond sombre (≈1,1:1 sur paper,
 * 1:1 sur le chip jaune lui-même) : un seul token pour les deux contextes
 * garantissait qu'il soit faux dans l'un des deux.
 *
 * Règle de choix : la couleur de l'anneau doit contraster avec le fond de
 * l'ÉLÉMENT au moment du focus (pas forcément celui de la section qui
 * l'entoure) — `*_LIGHT` (outline noire) sur tout élément dont le fond au
 * repos est clair (paper/paper-2/blanc) ou pop ; `*_DARK` (outline
 * pop-yellow) sur tout élément dont le fond au repos est ink/noir (y
 * compris les accents maison sombres — navy/brick en fond plein).
 */

/** Anneau intérieur (offset négatif) — fond clair ou pop : outline ink (R1, jamais noir littéral). */
export const FOCUS_RING_LIGHT =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-[-2px]";

/** Variante extérieure (décollée de 2px) du même anneau clair. */
export const FOCUS_RING_LIGHT_OUTER =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Anneau intérieur (offset négatif) — fond ink/noir : outline pop-yellow. */
export const FOCUS_RING_DARK =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-pop-yellow focus-visible:outline-offset-[-2px]";

/** Variante extérieure (décollée de 2px) du même anneau sombre. */
export const FOCUS_RING_DARK_OUTER =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pop-yellow";

/**
 * Cellule inversante : fond clair au repos, inversion en ink à l'état actif —
 * et au survol quand elle est inactive. Recette partagée par les étiquettes de
 * filtres, la mosaïque de thèmes et les numéros de pagination.
 */
export function invertingCell(active: boolean): string {
  return active
    ? "bg-ink text-paper"
    : "bg-paper text-ink hover:bg-ink hover:text-paper";
}
