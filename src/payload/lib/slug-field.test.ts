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

  it('update au champ VIDÉ : conserve l’existant, ne re-dérive JAMAIS du libellé (slug figé, panne du 2026-08-29)', () => {
    expect(
      fromTitle({
        value: '',
        data: { title: 'Les luttes des classes en France' },
        siblingData: { title: 'Les luttes des classes en France' },
        operation: 'update',
        originalDoc: { slug: 'les-luttes-de-classes-en-france' },
      } as never),
    ).toBe('les-luttes-de-classes-en-france')
  })

  it('update avec saisie explicite (rôle autorisé par l’access du champ) : slugifiée', () => {
    expect(
      fromTitle({
        value: 'Nouveau Slug Choisi',
        data: {},
        siblingData: {},
        operation: 'update',
        originalDoc: { slug: 'ancien' },
      } as never),
    ).toBe('nouveau-slug-choisi')
  })

  it('update d’une fiche SANS slug (donnée cassée) : seule exception, dérive du libellé', () => {
    expect(
      fromTitle({
        value: '',
        data: { title: 'Le Capital' },
        siblingData: { title: 'Le Capital' },
        operation: 'update',
        originalDoc: { slug: '' },
      } as never),
    ).toBe('le-capital')
  })
})
