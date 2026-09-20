import { beforeEach, describe, expect, it, vi } from 'vitest'

import { revalidatePath, revalidateTag } from 'next/cache'

import {
  revalidateCatalogueAfterChange,
  revalidateCatalogueAfterDelete,
} from './revalidate.ts'

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

/**
 * Le ciblage des purges est devenu LE mécanisme de fraîcheur (fenêtre ISR
 * filet à 24 h, audit coûts Vercel 2026-08-23) : une régression silencieuse
 * du switch par collection coûterait 24 h de contenu périmé sans signal —
 * d'où ces tests, `req.payload.find` mocké (aucune I/O).
 */

const LISTES = ['/', '/catalogue', '/editions', '/boutique', '/panier', '/sitemap.xml', '/rencontres', '/souscription']
// Un échantillon suffit : la purge large se reconnaît à la présence des motifs.
const MOTIF_LARGE = '/catalogue/[edition]/[slug]'

type ChangeArgs = Parameters<CollectionAfterChangeHook>[0]

function fakeReq(findResult: unknown[] = [], findImpl?: () => Promise<never>) {
  const find = findImpl
    ? vi.fn(findImpl)
    : vi.fn().mockResolvedValue({ docs: findResult })
  return { req: { context: {}, payload: { find } } as unknown as ChangeArgs['req'], find }
}

function purgedPaths(): string[] {
  return vi.mocked(revalidatePath).mock.calls.map(([path]) => String(path))
}

function changeArgs(overrides: {
  slug: string
  doc: Record<string, unknown>
  previousDoc?: Record<string, unknown>
  req: ChangeArgs['req']
}): ChangeArgs {
  return {
    collection: { slug: overrides.slug },
    doc: overrides.doc,
    previousDoc: overrides.previousDoc ?? overrides.doc,
    req: overrides.req,
  } as unknown as ChangeArgs
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear()
})

describe('revalidateCatalogueAfterChange — ciblage par collection', () => {
  it('books : listes + fiche littérale du doc, jamais les motifs larges', async () => {
    const { req, find } = fakeReq()
    await revalidateCatalogueAfterChange(
      changeArgs({
        slug: 'books',
        doc: { slug: 'le-capital', edition: 'editions-sociales' },
        req,
      }),
    )
    const paths = purgedPaths()
    for (const liste of LISTES) expect(paths).toContain(liste)
    expect(paths).toContain('/catalogue/editions-sociales/le-capital')
    expect(paths).not.toContain(MOTIF_LARGE)
    expect(find).not.toHaveBeenCalled()
  })

  it('books : le chemin PRÉCÉDENT est purgé quand le slug change (previousDoc)', async () => {
    const { req } = fakeReq()
    await revalidateCatalogueAfterChange(
      changeArgs({
        slug: 'books',
        doc: { slug: 'nouveau-slug', edition: 'la-dispute' },
        previousDoc: { slug: 'ancien-slug', edition: 'la-dispute' },
        req,
      }),
    )
    const paths = purgedPaths()
    expect(paths).toContain('/catalogue/la-dispute/nouveau-slug')
    expect(paths).toContain('/catalogue/la-dispute/ancien-slug')
  })

  it('books boutique-seul : fiche /boutique/<slug>', async () => {
    const { req } = fakeReq()
    await revalidateCatalogueAfterChange(
      changeArgs({ slug: 'books', doc: { slug: 'tote-bag', origin: 'boutique' }, req }),
    )
    expect(purgedPaths()).toContain('/boutique/tote-bag')
  })

  it('media : listes + fiches résolues par relation inverse (cover/tablePdf/extraitPdf)', async () => {
    const { req, find } = fakeReq([
      { slug: 'contre-la-gentrification', edition: 'la-dispute' },
      { slug: 'tote-bag', origin: 'boutique' },
    ])
    await revalidateCatalogueAfterChange(
      changeArgs({ slug: 'media', doc: { id: 7 }, req }),
    )
    const paths = purgedPaths()
    for (const liste of LISTES) expect(paths).toContain(liste)
    expect(paths).toContain('/catalogue/la-dispute/contre-la-gentrification')
    expect(paths).toContain('/boutique/tote-bag')
    expect(paths).not.toContain(MOTIF_LARGE)
    // La requête inverse porte bien sur les trois champs upload des fiches.
    const where = find.mock.calls[0]?.[0]?.where as { or?: unknown[] }
    expect(where.or).toHaveLength(3)
  })

  it('media fraîchement téléversé (aucune référence) : listes seules, zéro fiche', async () => {
    const { req } = fakeReq([])
    await revalidateCatalogueAfterChange(changeArgs({ slug: 'media', doc: { id: 8 }, req }))
    expect(purgedPaths().sort()).toEqual([...LISTES].sort())
  })

  it('authors/libelles : relation inverse `in` sur le champ de la collection', async () => {
    for (const slug of ['authors', 'libelles'] as const) {
      vi.mocked(revalidatePath).mockClear()
      const { req, find } = fakeReq([{ slug: 'fiche-liee', edition: 'editions-sociales' }])
      await revalidateCatalogueAfterChange(changeArgs({ slug, doc: { id: 3 }, req }))
      expect(purgedPaths()).toContain('/catalogue/editions-sociales/fiche-liee')
      expect(find.mock.calls[0]?.[0]?.where).toEqual({ [slug]: { in: [3] } })
    }
  })

  it('échec du ciblage : repli en purge LARGE (motifs), jamais de contenu périmé', async () => {
    const { req } = fakeReq([], () => Promise.reject(new Error('pool épuisé')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await revalidateCatalogueAfterChange(changeArgs({ slug: 'media', doc: { id: 9 }, req }))
    warn.mockRestore()
    expect(purgedPaths()).toContain(MOTIF_LARGE)
  })

  it('context.disableRevalidate : aucune purge (imports/migrations)', async () => {
    const { req } = fakeReq()
    ;(req.context as Record<string, unknown>).disableRevalidate = true
    await revalidateCatalogueAfterChange(changeArgs({ slug: 'books', doc: { slug: 'x' }, req }))
    expect(purgedPaths()).toEqual([])
  })

  describe('ebooks (client 2026-09-09) — relation DIRECTE, `livre` pointe vers le livre', () => {
    it('purge listes + fiche du livre lié (id nu, non peuplé)', async () => {
      const { req, find } = fakeReq([{ slug: 'notes-sur-mill', edition: 'editions-sociales' }])
      await revalidateCatalogueAfterChange(changeArgs({ slug: 'ebooks', doc: { livre: 12 }, req }))
      const paths = purgedPaths()
      for (const liste of LISTES) expect(paths).toContain(liste)
      expect(paths).toContain('/catalogue/editions-sociales/notes-sur-mill')
      expect(paths).not.toContain(MOTIF_LARGE)
      expect(find.mock.calls[0]?.[0]?.where).toEqual({ id: { equals: 12 } })
    })

    it('purge listes + fiche du livre lié (relation peuplée, `{ id }`)', async () => {
      const { req } = fakeReq([{ slug: 'notes-sur-mill', edition: 'editions-sociales' }])
      await revalidateCatalogueAfterChange(changeArgs({ slug: 'ebooks', doc: { livre: { id: 12 } }, req }))
      expect(purgedPaths()).toContain('/catalogue/editions-sociales/notes-sur-mill')
    })

    it('titre lié changé : purge AUSSI l’ancienne fiche (previousDoc.livre)', async () => {
      // Un id par livre : le mock générique (`fakeReq`) renvoie la MÊME
      // réponse à chaque appel — insuffisant ici, où les deux requêtes
      // (nouveau/ancien livre) doivent renvoyer des fiches DIFFÉRENTES.
      const byId: Record<number, { slug: string; edition: string }> = {
        12: { slug: 'nouveau-titre', edition: 'editions-sociales' },
        9: { slug: 'ancien-titre', edition: 'la-dispute' },
      }
      const find = vi.fn(async (args: { where?: { id?: { equals?: number } } }) => {
        const id = args?.where?.id?.equals
        const doc = id != null ? byId[id] : undefined
        return { docs: doc ? [doc] : [] }
      })
      const req = { context: {}, payload: { find } } as unknown as ChangeArgs['req']
      await revalidateCatalogueAfterChange(
        changeArgs({ slug: 'ebooks', doc: { livre: 12 }, previousDoc: { livre: 9 }, req }),
      )
      const paths = purgedPaths()
      expect(paths).toContain('/catalogue/editions-sociales/nouveau-titre')
      expect(paths).toContain('/catalogue/la-dispute/ancien-titre')
    })
  })
})

describe('revalidateCatalogueAfterDelete', () => {
  it('purge large + chemin littéral de la fiche supprimée (motifs peu fiables sur Vercel)', () => {
    const { req } = fakeReq()
    const args = {
      collection: { slug: 'books' },
      doc: { slug: 'supprime', edition: 'editions-sociales' },
      req,
    } as unknown as Parameters<CollectionAfterDeleteHook>[0]
    revalidateCatalogueAfterDelete(args)
    const paths = purgedPaths()
    expect(paths).toContain(MOTIF_LARGE)
    expect(paths).toContain('/catalogue/editions-sociales/supprime')
  })

  it('ebooks (client 2026-09-09) : ciblage explicite du livre lié, JAMAIS la purge large (bookFichePath ne peut rien pour un doc ebooks)', async () => {
    const { req } = fakeReq([{ slug: 'notes-sur-mill', edition: 'editions-sociales' }])
    const args = {
      collection: { slug: 'ebooks' },
      doc: { livre: 12 },
      req,
    } as unknown as Parameters<CollectionAfterDeleteHook>[0]
    await revalidateCatalogueAfterDelete(args)
    const paths = purgedPaths()
    expect(paths).toContain('/catalogue/editions-sociales/notes-sur-mill')
    expect(paths).not.toContain(MOTIF_LARGE)
  })
})

/**
 * Incident Neon 2026-09-19 : deux invariants de purge à ne pas laisser
 * régresser en silence.
 */
describe('incident Neon 2026-09-19', () => {
  beforeEach(() => vi.clearAllMocks())

  it("le cron des parutions ne touche JAMAIS le tag catalogue (base coupée = catalogue servi du cache)", async () => {
    const { revalidateParutionsNow } = await import('./revalidate.ts')
    revalidateParutionsNow(['/catalogue/la-dispute/un-livre'])
    expect(vi.mocked(revalidateTag)).not.toHaveBeenCalled()
    expect(purgedPaths()).toEqual([...LISTES, '/catalogue/la-dispute/un-livre'])
  })

  it('un global expire son data-cache AVANT de purger ses chemins', async () => {
    const { revalidatePagesLegalesAfterChange } = await import('./revalidate.ts')
    const { req } = fakeReq()
    await revalidatePagesLegalesAfterChange({ req } as never)
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith('site-global:pages-legales', { expire: 0 })
    expect(vi.mocked(revalidateTag).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(revalidatePath).mock.invocationCallOrder[0],
    )
  })
})
