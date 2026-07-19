/**
 * ISBN saisi en back-office : nettoyage + validation de format.
 * Tirets et espaces admis à la saisie ; la clé d'appariement stock
 * (`normalizeIsbn` dans `stock-import-core.ts`) reste « chiffres seuls ».
 */

/** Retire les espaces de bord — utilisé en `beforeValidate` avant contrôle. */
export function trimIsbn(value: string): string {
  return value.trim()
}

/** Compacte un ISBN : chiffres (+ `X` éventuel pour l'ISBN-10). */
export function compactIsbn(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

function isbn13CheckDigit(body12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return String((10 - (sum % 10)) % 10)
}

function isValidIsbn13(compact: string): boolean {
  if (!/^\d{13}$/.test(compact)) return false
  return isbn13CheckDigit(compact.slice(0, 12)) === compact[12]
}

function isValidIsbn10(compact: string): boolean {
  if (!/^\d{9}[\dX]$/.test(compact)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += Number(compact[i]) * (10 - i)
  }
  const check = compact[9] === 'X' ? 10 : Number(compact[9])
  return (sum + check) % 11 === 0
}

/**
 * Champ optionnel : vide = OK. Sinon ISBN-13 (préféré) ou ISBN-10,
 * tirets/espaces admis, clé de contrôle vérifiée.
 */
export function validateIsbnValue(value: unknown): true | string {
  if (value == null || value === '') return true
  if (typeof value !== 'string') {
    return 'ISBN invalide.'
  }
  const trimmed = trimIsbn(value)
  if (trimmed === '') return true
  if (/[^\d\s\-Xx]/.test(trimmed)) {
    return 'ISBN : uniquement chiffres, espaces ou tirets (ex. 978-2-35367-036-9).'
  }
  const compact = compactIsbn(trimmed)
  if (isValidIsbn13(compact) || isValidIsbn10(compact)) return true
  return 'ISBN invalide — attendu ISBN-13 (ex. 978-2-35367-036-9) ou ISBN-10.'
}
