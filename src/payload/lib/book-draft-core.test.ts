import { describe, expect, it } from 'vitest'

import {
  buildBookDraftData,
  buildLexicalPlaceholder,
  parseBookDraftRequest,
  resolveUniqueSlug,
  slugifyTitle,
  type BookDraftData,
} from './book-draft-core.ts'

describe('slugifyTitle', () => {
  it('minuscules, tirets, bornes propres', () => {
    expect(slugifyTitle('Le Capital — Livre I')).toBe('le-capital-livre-i')
  })

  it('retire les diacritiques', () => {
    expect(slugifyTitle('Gaza, génocide annoncé')).toBe('gaza-genocide-annonce')
  })

  it('trim les espaces et la ponctuation en bordure', () => {
    expect(slugifyTitle('  Principes fondamentaux !!  ')).toBe('principes-fondamentaux')
  })

  it('collapse les séparateurs multiples en un seul tiret', () => {
    expect(slugifyTitle('Économie   politique : théorie & pratique')).toBe(
      'economie-politique-theorie-pratique',
    )
  })
})

describe('resolveUniqueSlug', () => {
  it('slug de base absent de la liste → renvoyé tel quel', () => {
    expect(resolveUniqueSlug('le-capital', ['autre-slug'])).toBe('le-capital')
  })

  it('slug de base présent → suffixe -2', () => {
    expect(resolveUniqueSlug('le-capital', ['le-capital'])).toBe('le-capital-2')
  })

  it('slug de base et -2 présents → suffixe -3', () => {
    expect(resolveUniqueSlug('le-capital', ['le-capital', 'le-capital-2'])).toBe('le-capital-3')
  })

  it('liste vide → slug de base tel quel', () => {
    expect(resolveUniqueSlug('le-capital', [])).toBe('le-capital')
  })

  it('seul -2 présent (base absente) → slug de base tel quel', () => {
    expect(resolveUniqueSlug('le-capital', ['le-capital-2'])).toBe('le-capital')
  })
})

describe('buildLexicalPlaceholder', () => {
  it('un paragraphe portant le texte d’invite', () => {
    const placeholder = buildLexicalPlaceholder()
    expect(placeholder.root.type).toBe('root')
    expect(placeholder.root.children).toHaveLength(1)
    const [paragraph] = placeholder.root.children
    expect(paragraph.type).toBe('paragraph')
    expect(paragraph.children).toEqual([
      {
        type: 'text',
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
        text: 'Présentation à compléter.',
        version: 1,
      },
    ])
  })

  it('sérialisable (aller-retour JSON sans perte)', () => {
    const placeholder = buildLexicalPlaceholder()
    expect(JSON.parse(JSON.stringify(placeholder))).toEqual(placeholder)
  })
})

describe('parseBookDraftRequest', () => {
  const validBody = {
    title: 'Le Capital',
    edition: 'editions-sociales',
    authors: [1, 2],
    coverId: 42,
    dateParution: '2026-09-01',
    prix: 12.5,
    stock: 30,
  }

  it('corps complet valide → ok avec les champs normalisés', () => {
    expect(parseBookDraftRequest(validBody)).toEqual({
      ok: true,
      value: {
        title: 'Le Capital',
        edition: 'editions-sociales',
        authors: [1, 2],
        coverId: 42,
        dateParution: '2026-09-01',
        prix: 12.5,
        stock: 30,
      },
    })
  })

  it('prix/stock absents → value sans ces clés (undefined)', () => {
    const minimal: Record<string, unknown> = { ...validBody }
    delete minimal.prix
    delete minimal.stock
    const parsed = parseBookDraftRequest(minimal)
    expect(parsed).toEqual({
      ok: true,
      value: {
        title: 'Le Capital',
        edition: 'editions-sociales',
        authors: [1, 2],
        coverId: 42,
        dateParution: '2026-09-01',
        prix: undefined,
        stock: undefined,
      },
    })
  })

  it('corps non-objet → erreur', () => {
    expect(parseBookDraftRequest(null)).toEqual({
      ok: false,
      error: 'Corps de requête invalide (JSON attendu).',
    })
    expect(parseBookDraftRequest('pas un objet')).toEqual({
      ok: false,
      error: 'Corps de requête invalide (JSON attendu).',
    })
  })

  it('titre manquant/vide → erreur', () => {
    expect(parseBookDraftRequest({ ...validBody, title: '' })).toEqual({
      ok: false,
      error: 'Le titre est obligatoire.',
    })
    expect(parseBookDraftRequest({ ...validBody, title: '   ' })).toEqual({
      ok: false,
      error: 'Le titre est obligatoire.',
    })
  })

  it('maison absente ou hors liste → erreur', () => {
    expect(parseBookDraftRequest({ ...validBody, edition: 'wordpress' })).toEqual({
      ok: false,
      error: 'La maison (Éditions sociales / La Dispute) est obligatoire.',
    })
  })

  it('auteur·rice·s absent·e·s (tableau vide ou valeurs non numériques) → erreur', () => {
    expect(parseBookDraftRequest({ ...validBody, authors: [] })).toEqual({
      ok: false,
      error: 'Au moins un·e auteur·rice est requis·e.',
    })
    expect(parseBookDraftRequest({ ...validBody, authors: ['1', '2'] })).toEqual({
      ok: false,
      error: 'Au moins un·e auteur·rice est requis·e.',
    })
  })

  it('couverture manquante → erreur', () => {
    expect(parseBookDraftRequest({ ...validBody, coverId: undefined })).toEqual({
      ok: false,
      error: 'La couverture est obligatoire.',
    })
    expect(parseBookDraftRequest({ ...validBody, coverId: 1.5 })).toEqual({
      ok: false,
      error: 'La couverture est obligatoire.',
    })
  })

  it('date de parution manquante/invalide → erreur', () => {
    expect(parseBookDraftRequest({ ...validBody, dateParution: '' })).toEqual({
      ok: false,
      error: 'La date de parution est invalide.',
    })
    expect(parseBookDraftRequest({ ...validBody, dateParution: 'pas une date' })).toEqual({
      ok: false,
      error: 'La date de parution est invalide.',
    })
  })

  it('prix/stock non numériques → ignorés (undefined), pas d’erreur', () => {
    const parsed = parseBookDraftRequest({ ...validBody, prix: '12.5', stock: 'trente' })
    expect(parsed).toEqual({
      ok: true,
      value: {
        title: 'Le Capital',
        edition: 'editions-sociales',
        authors: [1, 2],
        coverId: 42,
        dateParution: '2026-09-01',
        prix: undefined,
        stock: undefined,
      },
    })
  })
})

describe('buildBookDraftData', () => {
  const base: BookDraftData = {
    title: 'Le Capital',
    slug: 'le-capital',
    edition: 'editions-sociales',
    authors: [1, 2],
    coverId: 42,
    dateParution: '2026-09-01',
  }

  it('assemble les champs obligatoires, toujours en brouillon', () => {
    const data = buildBookDraftData(base)
    expect(data).toMatchObject({
      title: 'Le Capital',
      slug: 'le-capital',
      edition: 'editions-sociales',
      authors: [1, 2],
      cover: 42,
      dateParution: '2026-09-01',
      sortDate: '2026-09-01',
      _status: 'draft',
    })
    expect(data.presentation).toEqual(buildLexicalPlaceholder())
  })

  it('prix absent → pas de clé `prix`', () => {
    const data = buildBookDraftData(base)
    expect(data).not.toHaveProperty('prix')
  })

  it('prix fourni → posé tel quel', () => {
    const data = buildBookDraftData({ ...base, prix: 12.5 })
    expect(data.prix).toBe(12.5)
  })

  it('stock absent → pas de groupe `commerce`', () => {
    const data = buildBookDraftData(base)
    expect(data).not.toHaveProperty('commerce')
  })

  it('stock fourni → groupe `commerce.stock` posé', () => {
    const data = buildBookDraftData({ ...base, stock: 30 })
    expect(data.commerce).toEqual({ stock: 30 })
  })

  it('sortDate toujours alignée sur dateParution', () => {
    const data = buildBookDraftData({ ...base, dateParution: '2027-01-15' })
    expect(data.sortDate).toBe('2027-01-15')
  })
})
