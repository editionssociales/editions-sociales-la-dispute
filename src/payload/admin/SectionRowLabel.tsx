'use client'

import { useRowLabel } from '@payloadcms/ui'

const TYPES: Record<string, string> = {
  texte: 'Texte',
  carrouselVideos: 'Carrousel de vidéos',
  carrouselArticles: 'Carrousel d’articles',
  miseEnAvant: 'Mise en avant',
  citation: 'Citation',
  maisons: 'Les deux maisons',
}

/**
 * Étiquette d'une section de `/nos-maisons` dans l'éditeur : « n. Type —
 * Titre de la section » (le titre est le champ `titre` saisi dans la section,
 * donc renommer une section la renomme aussi ici ; pour une citation, le
 * début du texte). Sans titre : le type seul.
 */
export const SectionRowLabel = () => {
  const { data, rowNumber } = useRowLabel<{ blockType?: string; titre?: string; texte?: string }>()
  const type = TYPES[data?.blockType ?? ''] ?? 'Section'
  const nom = (data?.titre || (data?.blockType === 'citation' ? data?.texte : '') || '').trim()
  const court = nom.length > 60 ? `${nom.slice(0, 60)}…` : nom
  const numero = typeof rowNumber === 'number' ? `${rowNumber + 1}. ` : ''
  return (
    <span>
      {numero}
      <strong>{type}</strong>
      {court ? ` — ${court}` : ''}
    </span>
  )
}
