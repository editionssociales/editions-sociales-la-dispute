import { describe, expect, it } from 'vitest'

import {
  authorIdsFromDoc,
  buildBookMediaAlt,
  buildCoverAlt,
  mediaIdFromDoc,
} from './cover-alt.ts'

describe('buildCoverAlt', () => {
  it('titre seul sans auteurs', () => {
    expect(buildCoverAlt('Le Capital', [])).toBe('Le Capital')
  })

  it('titre + auteurs, ordre conservé', () => {
    expect(buildCoverAlt('Le Capital', ['Karl Marx', 'Friedrich Engels'])).toBe(
      'Le Capital, Karl Marx, Friedrich Engels',
    )
  })

  it('ignore les noms vides', () => {
    expect(buildCoverAlt('Titre', ['', '  Auteur  ', ''])).toBe('Titre, Auteur')
  })
})

describe('buildBookMediaAlt', () => {
  it('préfixe table des matières et extrait', () => {
    expect(buildBookMediaAlt('cover', 'Le Capital', ['Karl Marx'])).toBe(
      'Le Capital, Karl Marx',
    )
    expect(buildBookMediaAlt('tablePdf', 'Le Capital', ['Karl Marx'])).toBe(
      'Table des matières — Le Capital, Karl Marx',
    )
    expect(buildBookMediaAlt('extraitPdf', 'Le Capital', [])).toBe('Extrait — Le Capital')
  })
})

describe('mediaIdFromDoc', () => {
  it('accepte id nu ou document peuplé', () => {
    expect(mediaIdFromDoc(12)).toBe(12)
    expect(mediaIdFromDoc({ id: 12, url: '/x.jpg' })).toBe(12)
    expect(mediaIdFromDoc(null)).toBe(null)
  })
})

describe('authorIdsFromDoc', () => {
  it('accepte ids nus ou documents peuplés', () => {
    expect(authorIdsFromDoc([1, { id: 2 }, 3])).toEqual([1, 2, 3])
    expect(authorIdsFromDoc(null)).toEqual([])
  })
})
