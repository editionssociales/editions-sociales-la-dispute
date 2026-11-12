import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { Books } from './Books.ts'

/** Parcourt les champs (onglets/rangées/groupes compris) à la recherche d'un nom. */
function findField(fields: Field[], name: string): Field | undefined {
  for (const f of fields) {
    if ('name' in f && f.name === name) return f
    const nested: Field[] =
      'fields' in f && Array.isArray(f.fields)
        ? f.fields
        : 'tabs' in f
          ? f.tabs.flatMap((t) => t.fields)
          : []
    const hit = findField(nested, name)
    if (hit) return hit
  }
  return undefined
}

describe('Books — masquer un livre du catalogue', () => {
  const masque = findField(Books.fields, 'masque')

  it('case `masque` : défaut faux, en barre latérale', () => {
    expect(masque).toMatchObject({ type: 'checkbox', defaultValue: false })
    expect((masque as { admin?: { position?: string } }).admin?.position).toBe('sidebar')
  })

  it("lisible par TOUS : aucune `access` de champ (la lecture publique du front est `overrideAccess: false`)", () => {
    expect((masque as { access?: unknown }).access).toBeUndefined()
  })

  it("l'adresse exacte ne s'affiche que lorsque la case est cochée", () => {
    const url = findField(Books.fields, 'masqueUrl') as {
      type: string
      admin: { condition: (data: Record<string, unknown>) => boolean }
    }
    expect(url.type).toBe('ui')
    expect(url.admin.condition({ masque: true })).toBe(true)
    expect(url.admin.condition({ masque: false })).toBe(false)
    expect(url.admin.condition({})).toBe(false)
  })
})
