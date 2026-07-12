/**
 * Primitives de classes de l'UI brutaliste — définies une fois, littérales (le
 * JIT Tailwind ne compile pas les classes concaténées dynamiquement).
 */

/** Anneau de focus de la famille catalogue : jaune pop, lisible sur blanc comme sur noir. */
export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-pop-yellow focus-visible:outline-offset-[-2px]";

/** Variante extérieure de l'anneau : décollée de 2px — boutons pleins, liens sur aplat. */
export const FOCUS_RING_OUTER =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pop-yellow";

/**
 * Cellule inversante : fond blanc au repos, inversion en noir à l'état actif —
 * et au survol quand elle est inactive. Recette partagée par les étiquettes de
 * filtres, la mosaïque de thèmes et les numéros de pagination.
 */
export function invertingCell(active: boolean): string {
  return active
    ? "bg-black text-white"
    : "bg-white text-black hover:bg-black hover:text-white";
}
