import type { FieldHook } from 'payload'

import { slugify } from './slugify.ts'

type LabelKey = 'title' | 'name'

/**
 * Slug : normalise la saisie, ou dérive du libellé source (`title` / `name`)
 * si vide. Sur un update partiel sans `slug` dans le payload, conserve
 * l'existant — même contrat que la fiche livre.
 */
export function deriveSlugFromLabel(...sources: LabelKey[]): FieldHook {
  return ({ value, data, siblingData, operation, originalDoc }) => {
    if (typeof value === 'string' && value.trim()) {
      return slugify(value)
    }
    if (operation === 'update' && value === undefined) {
      return typeof originalDoc?.slug === 'string' ? originalDoc.slug : value
    }
    for (const key of sources) {
      const raw =
        (typeof siblingData?.[key] === 'string' && siblingData[key]) ||
        (typeof data?.[key] === 'string' && data[key]) ||
        (typeof originalDoc?.[key] === 'string' && originalDoc[key]) ||
        ''
      if (typeof raw === 'string' && raw.trim()) {
        return slugify(raw)
      }
    }
    return value
  }
}
