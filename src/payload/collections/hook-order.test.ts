import { describe, expect, it } from 'vitest'

import type { CollectionConfig } from 'payload'

import { Authors } from './Authors.ts'
import { BookLabels } from './BookLabels.ts'
import { autofillBuyLinks, Books, setContentTouched } from './Books.ts'
import { Media } from './Media.ts'
import { revalidateCatalogueAfterChange, revalidateCatalogueAfterDelete } from '../hooks/revalidate.ts'
import {
  revalidateCatalogueTagAfterChange,
  revalidateCatalogueTagAfterDelete,
} from '../hooks/revalidate-catalogue.ts'

/**
 * Verrouille l'invariant d'ordre des hooks énoncé par `src/payload/CLAUDE.md`
 * (Local Contracts) : « le hook tag TOUJOURS avant le hook chemins dans les
 * tableaux afterChange/afterDelete (read-your-writes, constaté en prod
 * Vercel) ». Test sans I/O — les 4 collections catalogue sont de simples
 * objets de config, importés pour leur seul tableau `hooks`.
 *
 * Un régression ici (tag posé APRÈS la purge de chemins) rouvrirait la fenêtre
 * où le premier re-rendu post-édition repart d'un data-cache encore périmé
 * (constat live 2026-07-19).
 */

const CATALOGUE_COLLECTIONS: { name: string; config: CollectionConfig }[] = [
  { name: 'Books', config: Books },
  { name: 'Authors', config: Authors },
  { name: 'BookLabels', config: BookLabels },
  { name: 'Media', config: Media },
]

function indexOfHook(hooks: unknown[] | undefined, hook: unknown): number {
  return (hooks ?? []).indexOf(hook)
}

describe('invariant d’ordre des hooks catalogue (tag avant chemins)', () => {
  for (const { name, config } of CATALOGUE_COLLECTIONS) {
    it(`${name}.hooks.afterChange : revalidateCatalogueTagAfterChange avant revalidateCatalogueAfterChange`, () => {
      const tagIndex = indexOfHook(config.hooks?.afterChange, revalidateCatalogueTagAfterChange)
      const pathsIndex = indexOfHook(config.hooks?.afterChange, revalidateCatalogueAfterChange)
      expect(tagIndex).toBeGreaterThanOrEqual(0)
      expect(pathsIndex).toBeGreaterThanOrEqual(0)
      expect(tagIndex).toBeLessThan(pathsIndex)
    })

    it(`${name}.hooks.afterDelete : revalidateCatalogueTagAfterDelete avant revalidateCatalogueAfterDelete`, () => {
      const tagIndex = indexOfHook(config.hooks?.afterDelete, revalidateCatalogueTagAfterDelete)
      const pathsIndex = indexOfHook(config.hooks?.afterDelete, revalidateCatalogueAfterDelete)
      expect(tagIndex).toBeGreaterThanOrEqual(0)
      expect(pathsIndex).toBeGreaterThanOrEqual(0)
      expect(tagIndex).toBeLessThan(pathsIndex)
    })
  }
})

/**
 * Invariant distinct (mission liens libraires) : `contentTouched` doit être
 * posé AVANT que l'autofill des liens libraires ne lise/écrive `data` — les
 * deux opèrent sur le même objet `data` au fil du tableau `beforeChange`,
 * `setContentTouched` n'a pas de raison de dépendre de `buy`, mais l'inverse
 * (un futur hook lisant `contentTouched`) resterait correct dans cet ordre.
 */
describe('Books.hooks.beforeChange : setContentTouched avant autofillBuyLinks', () => {
  it('les deux hooks sont présents, dans cet ordre', () => {
    const contentTouchedIndex = indexOfHook(Books.hooks?.beforeChange, setContentTouched)
    const autofillIndex = indexOfHook(Books.hooks?.beforeChange, autofillBuyLinks)
    expect(contentTouchedIndex).toBeGreaterThanOrEqual(0)
    expect(autofillIndex).toBeGreaterThanOrEqual(0)
    expect(contentTouchedIndex).toBeLessThan(autofillIndex)
  })
})
