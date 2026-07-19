import { describe, expect, it } from 'vitest'

import { deriveSlugFromLabel } from './slug-field.ts'

describe('deriveSlugFromLabel', () => {
  const fromName = deriveSlugFromLabel('name')
  const fromTitle = deriveSlugFromLabel('title')

  it('normalise une saisie explicite', () => {
    expect(
      fromName({
        value: '  Travail & Genre  ',
        data: {},
        siblingData: {},
        operation: 'create',
      } as never),
    ).toBe('travail-genre')
  })

  it('dérive du name si slug vide', () => {
    expect(
      fromName({
        value: '',
        data: { name: "L'Idéologie" },
        siblingData: { name: "L'Idéologie" },
        operation: 'create',
      } as never),
    ).toBe('l-ideologie')
  })

  it('dérive du title pour les livres', () => {
    expect(
      fromTitle({
        value: undefined,
        data: { title: 'Le Capital' },
        siblingData: { title: 'Le Capital' },
        operation: 'create',
      } as never),
    ).toBe('le-capital')
  })

  it('conserve le slug existant sur update partiel sans champ slug', () => {
    expect(
      fromName({
        value: undefined,
        data: {},
        siblingData: {},
        operation: 'update',
        originalDoc: { slug: 'deja-la' },
      } as never),
    ).toBe('deja-la')
  })
})
