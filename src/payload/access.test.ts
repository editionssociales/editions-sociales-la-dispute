import { describe, expect, it } from 'vitest'

import type { Access } from 'payload'

import { isAdmin, isAdminOrEditor } from './access.ts'

/**
 * `isAdmin`/`isAdminOrEditor` n'étaient jusqu'ici exercées qu'indirectement,
 * via les handlers d'endpoints custom qui les appellent en tête (cf.
 * `src/payload/CLAUDE.md`). Test direct des deux gardes, sur les trois rôles
 * possibles de `{ req: { user } }` : admin, editor, non connecté (`null`).
 */

function ctx(role: 'admin' | 'editor' | null): Parameters<Access>[0] {
  return { req: { user: role ? { role } : null } } as Parameters<Access>[0]
}

describe('isAdmin', () => {
  it('true pour un rôle admin', () => {
    expect(isAdmin(ctx('admin'))).toBe(true)
  })

  it('false pour un rôle editor', () => {
    expect(isAdmin(ctx('editor'))).toBe(false)
  })

  it('false sans utilisateur connecté', () => {
    expect(isAdmin(ctx(null))).toBe(false)
  })
})

describe('isAdminOrEditor', () => {
  it('true pour un rôle admin', () => {
    expect(isAdminOrEditor(ctx('admin'))).toBe(true)
  })

  it('true pour un rôle editor', () => {
    expect(isAdminOrEditor(ctx('editor'))).toBe(true)
  })

  it('false sans utilisateur connecté', () => {
    expect(isAdminOrEditor(ctx(null))).toBe(false)
  })
})
