import * as XLSX from 'xlsx'
import { describe, expect, it, vi } from 'vitest'

import type { Payload, PayloadRequest } from 'payload'

/**
 * Orchestration de `POST /api/books/import-stock` testée à travers
 * l'interface réelle du handler (`PayloadRequest → Response`, même patron que
 * `src/app/api/checkout/route.test.ts`). Seams nommés mockés :
 * - `addDataAndFileToRequest` (utilitaire `payload`, parse le multipart) — on
 *   ne réimplémente pas un vrai parseur multipart ici, on injecte directement
 *   `req.file` comme le ferait le vrai utilitaire ;
 * - `req.payload.{find,update,create}` (I/O Postgres).
 * Le cœur pur (`parseRouterWorkbook`/`matchStock`, `stock-import-core.ts`)
 * tourne pour de vrai, sur un classeur .xls fabriqué en mémoire (même fixture
 * que `stock-import-core.test.ts`).
 *
 * Priorité (issue #69) : la garde d'accès (`isAdmin` en tête de handler).
 */

let nextFile: { data: Buffer; name: string; mimetype: string; size: number } | null = null

// Seul export runtime de `payload` consommé par `stock-import.ts` — le reste
// de la chaîne importée par ce module (`access.ts`, `stock-import-core.ts`)
// n'importe `payload` qu'en type-only (erasé à la compilation). Pas de
// `importOriginal` : charger le vrai paquet `payload` ici tirerait tout son
// graphe d'initialisation pour rien.
vi.mock('payload', () => ({
  addDataAndFileToRequest: vi.fn(async (req: PayloadRequest) => {
    if (nextFile) req.file = nextFile
  }),
}))

const { importStockHandler } = await import('./stock-import.ts')

function routerWorkbook(rows: (string | number)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([['EAN', 'TIT', 'AUT', 'ABR', 'PUB', 'FIN'], ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Feuille1')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xls' }) as Buffer
}

interface FakeBookDoc {
  id: number
  slug: string
  title: string
  isbn: string | null
  commerce?: { stockSuivi?: 'routeur' | 'manuel' | null }
}

function fakePayload(books: FakeBookDoc[]) {
  const find = vi.fn(async () => ({ docs: books }))
  const update = vi.fn(async (_args: Record<string, unknown>) => ({}))
  const create = vi.fn(async (_args: Record<string, unknown>) => ({}))
  // `importStockHandler` logue l'erreur via `req.payload.logger.error` sur le
  // chemin d'échec (fichier illisible) — sans ce stub, ce chemin planterait
  // avant même de produire la réponse 400.
  const logger = { error: vi.fn() }
  return { payload: { find, update, create, logger } as unknown as Payload, find, update, create }
}

function req(url: string, { user, payload }: { user: { role: string } | null; payload: Payload }): PayloadRequest {
  const request = new Request(url, { method: 'POST' }) as unknown as PayloadRequest
  Object.assign(request, {
    payload,
    user,
    context: {},
    searchParams: new URL(url).searchParams,
  })
  return request
}

const URL_IMPORT = 'https://admin.exemple.test/api/books/import-stock'

describe('importStockHandler — garde d’accès', () => {
  it('visiteur anonyme (pas de user) → 403, jamais de lecture Payload', async () => {
    nextFile = null
    const { payload, find } = fakePayload([])
    const res = await importStockHandler(req(URL_IMPORT, { user: null, payload }))
    expect(res.status).toBe(403)
    expect(find).not.toHaveBeenCalled()
  })

  it('editor (pas admin) → 403 — resserré à isAdmin (geste sensible, écrase du stock)', async () => {
    nextFile = null
    const { payload, find } = fakePayload([])
    const res = await importStockHandler(req(URL_IMPORT, { user: { role: 'editor' }, payload }))
    expect(res.status).toBe(403)
    expect(find).not.toHaveBeenCalled()
  })
})

describe('importStockHandler — fichier', () => {
  it('aucun fichier reçu → 400', async () => {
    nextFile = null
    const { payload } = fakePayload([])
    const res = await importStockHandler(req(URL_IMPORT, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Aucun fichier reçu.')
  })

  it('fichier illisible (feuille "Feuille1" absente) → 400, message explicite, jamais d’écriture', async () => {
    const badWorkbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(badWorkbook, XLSX.utils.aoa_to_sheet([['x']]), 'AutreFeuille')
    nextFile = {
      data: XLSX.write(badWorkbook, { type: 'buffer', bookType: 'xls' }) as Buffer,
      name: 'stock.xls',
      mimetype: 'application/vnd.ms-excel',
      size: 100,
    }
    const { payload, update, create } = fakePayload([])
    const res = await importStockHandler(req(URL_IMPORT, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Feuille1')
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('importStockHandler — appariement et écriture (cas nominal)', () => {
  it('livre apparié par ISBN → écrit stock/stockSuivi/stockUpdatedAt, garde migration+disableRevalidate, trace le run', async () => {
    nextFile = {
      data: routerWorkbook([[9782843033452, 'Le Capital', 'Marx, Karl', 'ignoré', 45793, 42]]),
      name: 'stock.xls',
      mimetype: 'application/vnd.ms-excel',
      size: 100,
    }
    const books: FakeBookDoc[] = [
      {
        id: 12,
        slug: 'le-capital',
        title: 'Le Capital',
        isbn: '978-2-84303-345-2',
        commerce: { stockSuivi: 'manuel' },
      },
    ]
    const { payload, update, create, find } = fakePayload(books)
    const res = await importStockHandler(req(URL_IMPORT, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updatedCount).toBe(1)

    // Univers d'appariement : livres du catalogue uniquement.
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'books', where: { origin: { equals: 'catalogue' } } }),
    )

    expect(update).toHaveBeenCalledTimes(1)
    const updateCall = update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateCall).toMatchObject({
      collection: 'books',
      id: 12,
      data: { commerce: { stockSuivi: 'routeur', stock: 42 } },
      context: { migration: true, disableRevalidate: true },
      overrideAccess: true,
    })

    expect(create).toHaveBeenCalledTimes(1)
    const createCall = create.mock.calls[0]?.[0] as Record<string, unknown>
    expect(createCall).toMatchObject({ collection: 'import-runs' })
  })

  it('aucune ligne appariée → 200, updatedCount 0, aucune écriture de fiche (le run est quand même tracé)', async () => {
    nextFile = {
      data: routerWorkbook([[1111111111111, 'Inconnu du catalogue', 'X', 'ignoré', 1, 3]]),
      name: 'stock.xls',
      mimetype: 'application/vnd.ms-excel',
      size: 100,
    }
    const { payload, update, create } = fakePayload([
      { id: 1, slug: 'autre', title: 'Autre', isbn: '978-0000000001', commerce: { stockSuivi: 'manuel' } },
    ])
    const res = await importStockHandler(req(URL_IMPORT, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updatedCount).toBe(0)
    expect(update).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledTimes(1)
  })
})
