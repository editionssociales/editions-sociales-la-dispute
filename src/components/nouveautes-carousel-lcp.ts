/**
 * Index et `sizes` du carrousel des nouveautés — extraits du composant
 * client pour rester testables sans `next/image` (issue #109).
 *
 * L'index centré au premier paint est le 2e livre s'il y en a au moins
 * deux (volontaire : la vitrine ne démarre pas sur le bord du rail).
 * C'est CETTE couverture qui est le LCP, pas l'index 0.
 */

export function nouveautesInitialIndex(count: number): number {
  return count > 1 ? 1 : 0;
}

/** `sizes` de la carte CENTRALE (peinte ~plein zoom). */
export const NOUVEAUTES_COVER_SIZES_CENTER = "(max-width: 640px) 42vw, 260px";
/** Cartes latérales downscalées (`scale` jusqu'à 0.72) — srcset plus serré. */
export const NOUVEAUTES_COVER_SIZES_SIDE = "(max-width: 640px) 28vw, 190px";

export function nouveautesCoverSizes(index: number, initialIndex: number): string {
  return index === initialIndex ? NOUVEAUTES_COVER_SIZES_CENTER : NOUVEAUTES_COVER_SIZES_SIDE;
}
