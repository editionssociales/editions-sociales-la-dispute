import type { FieldHook } from 'payload'

import { slugify } from './slugify.ts'

type LabelKey = 'title' | 'name'

/**
 * Slug : normalise la saisie, ou dérive du libellé source (`title` / `name`)
 * si vide — À LA CRÉATION seulement. Sur un update, un champ absent OU VIDÉ
 * conserve l'existant, jamais une re-dérivation depuis le libellé : un titre
 * corrigé ne doit pas renommer un slug publié en silence (panne contreparties
 * du 2026-08-29 — URLs, redirections et compositions cassées). Le verrou de
 * rôles complète ce garde-fou : `access.update: isAdminField` sur chaque
 * champ slug (seuls les admins peuvent saisir un nouveau slug, en
 * connaissance des liens qui cassent).
 */
export function deriveSlugFromLabel(...sources: LabelKey[]): FieldHook {
  return ({ value, data, siblingData, operation, originalDoc }) => {
    if (typeof value === 'string' && value.trim()) {
      return slugify(value)
    }
    if (operation === 'update') {
      const existing =
        typeof originalDoc?.slug === 'string' && originalDoc.slug.trim() ? originalDoc.slug : null
      // Fiche sans slug (donnée cassée à réparer) : seule exception où
      // l'update retombe sur la dérivation ci-dessous.
      if (existing) return existing
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
