/**
 * Textes alternatifs des médias rattachés à une fiche livre — couverture,
 * table des matières, extrait. Formule de base alignée sur la carte catalogue
 * (`book-card.tsx`) : « Titre, Auteur1, Auteur2 » ou le titre seul.
 */

export type BookMediaKind = 'cover' | 'tablePdf' | 'extraitPdf'

/** Base « Titre, auteurs » (sans préfixe de type de document). */
export function buildCoverAlt(title: string, authorNames: readonly string[]): string {
  const authors = authorNames.map((n) => n.trim()).filter(Boolean).join(', ')
  const trimmedTitle = title.trim()
  return authors ? `${trimmedTitle}, ${authors}` : trimmedTitle
}

/** Alt CMS selon le rôle du média sur la fiche. */
export function buildBookMediaAlt(
  kind: BookMediaKind,
  title: string,
  authorNames: readonly string[],
): string {
  const base = buildCoverAlt(title, authorNames)
  switch (kind) {
    case 'cover':
      return base
    case 'tablePdf':
      return `Table des matières — ${base}`
    case 'extraitPdf':
      return `Extrait — ${base}`
  }
}

/** Extrait un id média depuis un champ upload/relationship (id nu ou peuplé). */
export function mediaIdFromDoc(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

/** Ids auteurs depuis `books.authors` (ids nus ou documents peuplés), ordre conservé. */
export function authorIdsFromDoc(authors: unknown): number[] {
  if (!Array.isArray(authors)) return []
  const ids: number[] = []
  for (const entry of authors) {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      ids.push(entry)
      continue
    }
    if (entry && typeof entry === 'object' && 'id' in entry) {
      const id = (entry as { id: unknown }).id
      if (typeof id === 'number' && Number.isFinite(id)) ids.push(id)
    }
  }
  return ids
}
