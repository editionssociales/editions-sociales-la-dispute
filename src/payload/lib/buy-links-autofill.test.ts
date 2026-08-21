import { describe, expect, it, vi } from 'vitest'

import type { PayloadRequest } from 'payload'

import { makeAutofillBuyLinks } from './buy-links-autofill.ts'
import type { BuyLinksNeed, ResolvedBuyLinks } from './buy-links-resolve.ts'

/**
 * Hook `beforeChange` testé avec un résolveur FACTICE (jamais `resolveBuyLinks`
 * — zéro réseau ici) : `makeAutofillBuyLinks` est la fabrique injectable, le
 * hook branché en prod (`Books.ts`) est `makeAutofillBuyLinks(resolveBuyLinks)`.
 * L'ordre `[setContentTouched, autofillBuyLinks]` de `Books.hooks.beforeChange`
 * est verrouillé séparément dans `collections/hook-order.test.ts`.
 */

const EAN = '9782353671281'
const PARIS_FICHE = `https://www.parislibrairies.fr/livre/${EAN}-un-titre/`
const LALIBRAIRIE_FICHE = `https://www.lalibrairie.com/livres/un-titre_0-1_${EAN}.html`
const OLD_EAN = '9782353670369'

function fakeReq(context: Record<string, unknown> = {}) {
  const loggerError = vi.fn()
  const req = {
    context,
    payload: { logger: { error: loggerError } },
  } as unknown as PayloadRequest
  return { req, loggerError }
}

describe('makeAutofillBuyLinks', () => {
  it('context.migration → passthrough sans appel résolveur', async () => {
    const resolver = vi.fn()
    const hook = makeAutofillBuyLinks(resolver)
    const data = { isbn: '978-2-35367-128-1', buy: {} }
    const { req } = fakeReq({ migration: true })
    const result = await hook({
      data,
      req,
      operation: 'update',
      originalDoc: undefined,
      collection: {} as never,
    } as never)
    expect(result).toBe(data)
    expect(resolver).not.toHaveBeenCalled()
  })

  it('liens déjà remplis → aucun appel résolveur', async () => {
    const resolver = vi.fn()
    const hook = makeAutofillBuyLinks(resolver)
    const data = {
      isbn: '978-2-35367-128-1',
      buy: { boutiqueUrl: null, parislibrairies: PARIS_FICHE, lalibrairie: LALIBRAIRIE_FICHE },
    }
    const { req } = fakeReq()
    const result = await hook({
      data,
      req,
      operation: 'update',
      originalDoc: { isbn: '978-2-35367-128-1', buy: data.buy },
      collection: {} as never,
    } as never)
    expect(result).toBe(data)
    expect(resolver).not.toHaveBeenCalled()
  })

  it('champ vide → rempli depuis le résolveur', async () => {
    const resolver = vi.fn(
      async (_ean13: string, _need: BuyLinksNeed): Promise<ResolvedBuyLinks> => ({
        parislibrairies: PARIS_FICHE,
        lalibrairie: LALIBRAIRIE_FICHE,
      }),
    )
    const hook = makeAutofillBuyLinks(resolver)
    const data = { isbn: '978-2-35367-128-1', buy: {} }
    const { req } = fakeReq()
    const result = await hook({
      data,
      req,
      operation: 'create',
      originalDoc: undefined,
      collection: {} as never,
    } as never)
    expect(resolver).toHaveBeenCalledWith(EAN, { needParis: true, needLalibrairie: true })
    expect(result).toMatchObject({
      buy: { parislibrairies: PARIS_FICHE, lalibrairie: LALIBRAIRIE_FICHE },
    })
  })

  it('résolveur renvoie null → champ laissé intact (retenté au prochain enregistrement)', async () => {
    const resolver = vi.fn(async (): Promise<ResolvedBuyLinks> => ({ parislibrairies: null, lalibrairie: null }))
    const hook = makeAutofillBuyLinks(resolver)
    const data = { isbn: '978-2-35367-128-1', buy: {} }
    const { req } = fakeReq()
    const result = await hook({
      data,
      req,
      operation: 'create',
      originalDoc: undefined,
      collection: {} as never,
    } as never)
    expect(result.buy.parislibrairies).toBeFalsy()
    expect(result.buy.lalibrairie).toBeFalsy()
  })

  it('résolveur qui jette → data intact, aucun throw remonté', async () => {
    const resolver = vi.fn(async () => {
      throw new Error('site tiers en carafe')
    })
    const hook = makeAutofillBuyLinks(resolver)
    const data = { isbn: '978-2-35367-128-1', buy: {} }
    const { req, loggerError } = fakeReq()
    const result = await hook({
      data,
      req,
      operation: 'create',
      originalDoc: undefined,
      collection: {} as never,
    } as never)
    expect(result).toBe(data)
    expect(loggerError).toHaveBeenCalled()
  })

  it('ISBN changé + ancien lien contenant l’ancien EAN → re-résolu', async () => {
    const resolver = vi.fn(
      async (): Promise<ResolvedBuyLinks> => ({ parislibrairies: PARIS_FICHE, lalibrairie: LALIBRAIRIE_FICHE }),
    )
    const hook = makeAutofillBuyLinks(resolver)
    const data = { isbn: '978-2-35367-128-1' }
    const originalDoc = {
      isbn: '978-2-35367-036-9',
      buy: {
        boutiqueUrl: null,
        parislibrairies: `https://www.parislibrairies.fr/livre/${OLD_EAN}-ancien-titre/`,
        lalibrairie: `https://www.lalibrairie.com/livres/ancien-titre_0-1_${OLD_EAN}.html`,
      },
    }
    const { req } = fakeReq()
    const result = await hook({
      data,
      req,
      operation: 'update',
      originalDoc,
      collection: {} as never,
    } as never)
    expect(resolver).toHaveBeenCalledWith(EAN, { needParis: true, needLalibrairie: true })
    expect(result.buy).toMatchObject({ parislibrairies: PARIS_FICHE, lalibrairie: LALIBRAIRIE_FICHE })
  })

  it('boutiqueUrl jamais modifié', async () => {
    const resolver = vi.fn(
      async (): Promise<ResolvedBuyLinks> => ({ parislibrairies: PARIS_FICHE, lalibrairie: LALIBRAIRIE_FICHE }),
    )
    const hook = makeAutofillBuyLinks(resolver)
    const data = { isbn: '978-2-35367-128-1', buy: { boutiqueUrl: 'https://boutique.exemple.fr/x' } }
    const { req } = fakeReq()
    const result = await hook({
      data,
      req,
      operation: 'create',
      originalDoc: undefined,
      collection: {} as never,
    } as never)
    expect(result.buy.boutiqueUrl).toBe('https://boutique.exemple.fr/x')
  })
})
