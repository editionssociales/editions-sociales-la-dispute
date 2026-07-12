/**
 * Normalise un code promo saisi au back-office : majuscules, espaces de bord
 * retirés — pour qu'`AGREG2027`, `agreg2027 ` et ` Agreg2027` désignent le
 * même code à la validation du checkout (plan phase 4, §3/étape 8).
 */
export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase()
}
