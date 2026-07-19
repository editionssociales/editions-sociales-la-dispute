/**
 * Slug d'URL à partir d'un titre (ou d'une saisie libre) : minuscules,
 * sans accents, tirets. Ex. « L'Idéologie allemande » → `l-ideologie-allemande`.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[''ʼ]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
