import { describe, expect, it } from 'vitest'

import {
  checkCollectionEditionMatch,
  resolveCollectionEditionLookup,
  type BookEditionFields,
} from './books-core.ts'

describe('resolveCollectionEditionLookup', () => {
  it('relation en id nu → collectionId = cet id', () => {
    const lookup = resolveCollectionEditionLookup({ collection: 42, edition: 'la-dispute' }, null)
    expect(lookup).toEqual({ collectionId: 42, bookEdition: 'la-dispute' })
  })

  it('relation en document peuplé (depth > 0) → collectionId = son id', () => {
    const lookup = resolveCollectionEditionLookup(
      { collection: { id: 42 }, edition: 'la-dispute' },
      null,
    )
    expect(lookup).toEqual({ collectionId: 42, bookEdition: 'la-dispute' })
  })

  it('collection absente → undefined (rien à vérifier, pas de findByID)', () => {
    expect(resolveCollectionEditionLookup({ edition: 'la-dispute' }, null)).toBeUndefined()
  })

  it('edition absente → undefined', () => {
    expect(resolveCollectionEditionLookup({ collection: 42 }, null)).toBeUndefined()
  })

  it('document peuplé sans id exploitable → undefined', () => {
    expect(resolveCollectionEditionLookup({ collection: {}, edition: 'la-dispute' }, null)).toBeUndefined()
  })

  it('data et originalDoc vides → undefined', () => {
    expect(resolveCollectionEditionLookup(null, null)).toBeUndefined()
  })

  it('fusion : collection dans data, edition seulement dans originalDoc (bulk-edit partiel)', () => {
    const data: BookEditionFields = { collection: 42 }
    const originalDoc: BookEditionFields = { collection: 7, edition: 'editions-sociales' }
    expect(resolveCollectionEditionLookup(data, originalDoc)).toEqual({
      collectionId: 42,
      bookEdition: 'editions-sociales',
    })
  })

  it('fusion : edition dans data, collection seulement dans originalDoc (bulk-edit partiel)', () => {
    const data: BookEditionFields = { edition: 'la-dispute' }
    const originalDoc: BookEditionFields = { collection: 7, edition: 'editions-sociales' }
    expect(resolveCollectionEditionLookup(data, originalDoc)).toEqual({
      collectionId: 7,
      bookEdition: 'la-dispute',
    })
  })

  it('data prime sur originalDoc quand les deux portent la même clé', () => {
    const data: BookEditionFields = { collection: 42, edition: 'la-dispute' }
    const originalDoc: BookEditionFields = { collection: 7, edition: 'editions-sociales' }
    expect(resolveCollectionEditionLookup(data, originalDoc)).toEqual({
      collectionId: 42,
      bookEdition: 'la-dispute',
    })
  })
})

describe('checkCollectionEditionMatch', () => {
  it('maisons identiques → ok', () => {
    expect(checkCollectionEditionMatch('la-dispute', 'la-dispute')).toEqual({ ok: true })
  })

  it('maisons différentes → erreur avec message explicite', () => {
    expect(checkCollectionEditionMatch('editions-sociales', 'la-dispute')).toEqual({
      ok: false,
      message:
        'Cette collection appartient à la maison « la-dispute », incompatible avec la maison « editions-sociales » choisie pour ce livre.',
    })
  })

  it('collection sans maison renseignée → ok (rien à contrôler)', () => {
    expect(checkCollectionEditionMatch('la-dispute', null)).toEqual({ ok: true })
    expect(checkCollectionEditionMatch('la-dispute', undefined)).toEqual({ ok: true })
  })
})
