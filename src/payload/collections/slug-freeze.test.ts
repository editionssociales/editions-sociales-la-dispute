import { describe, expect, it } from 'vitest'

import type { Field } from 'payload'

import { isAdminField } from '../access.ts'
import { Authors } from './Authors.ts'
import { BookLabels } from './BookLabels.ts'
import { Books } from './Books.ts'

/**
 * Slugs FIGÉS après création (décision 2026-08-29, panne dons 75/300 € : un
 * slug renommé au back-office casse URLs, redirections et compositions de
 * contreparties) — contrat rendu EXÉCUTABLE, même parti pris que
 * `Orders.test.ts` : inspection de config, aucune I/O. Le hook
 * (`slug-field.test.ts`) verrouille l'autre moitié — jamais de re-dérivation
 * depuis le libellé sur un update.
 */

/** Premier champ `slug` de la config, où qu'il soit imbriqué (rows/tabs/groups). */
function findSlugField(fields: Field[]): Field | null {
  for (const field of fields) {
    if ('name' in field && field.name === 'slug') return field
    for (const key of ['fields', 'tabs'] as const) {
      const children = (field as Record<string, unknown>)[key]
      if (!Array.isArray(children)) continue
      const nested = findSlugField(
        key === 'tabs'
          ? (children as { fields: Field[] }[]).flatMap((tab) => tab.fields)
          : (children as Field[]),
      )
      if (nested) return nested
    }
  }
  return null
}

describe.each([
  ['Books', Books],
  ['Authors', Authors],
  ['BookLabels', BookLabels],
] as const)('slug figé — %s', (_name, collection) => {
  it('le champ slug porte access.update = isAdminField (éditeur·rices : lecture seule après création)', () => {
    const slug = findSlugField(collection.fields)
    expect(slug).not.toBeNull()
    expect((slug as { access?: { update?: unknown } }).access?.update).toBe(isAdminField)
  })
})
