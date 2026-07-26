import { describe, expect, it, vi } from 'vitest'

import type { Payload, PayloadRequest } from 'payload'

import { importRunRapportHandler } from './import-run-report-handler.ts'
import type { StockImportReport } from './stock-import-core.ts'

/**
 * Orchestration de `GET /api/import-runs/:id/rapport` testée à travers
 * l'interface réelle du handler (`PayloadRequest → Response`, même patron que
 * `src/app/api/checkout/route.test.ts`) — seul `req.payload.findByID` (le seam
 * I/O nommé) est mocké ; le formatage CSV (`import-run-report-core.ts`) tourne
 * pour de vrai (module pur, déjà couvert par `import-run-report-core.test.ts`).
 *
 * Priorité (issue #69) : la garde d'accès (`isAdmin` en tête de handler).
 */

function emptyReport(): StockImportReport {
  return {
    matched: [],
    routerRowsWithoutBook: 0,
    manualBooksNotInFile: [],
    routerBooksMissingFromFile: [],
  }
}

function req(
  url: string,
  {
    user = null,
    findByID,
    routeParams,
  }: {
    user?: { role: string } | null
    findByID: unknown
    routeParams?: Record<string, unknown>
  },
): PayloadRequest {
  const request = new Request(url) as unknown as PayloadRequest
  Object.assign(request, {
    payload: { findByID } as unknown as Payload,
    user,
    context: {},
    routeParams: routeParams ?? { id: '7' },
    searchParams: new URL(url).searchParams,
  })
  return request
}

const URL_RAPPORT = 'https://admin.exemple.test/api/import-runs/7/rapport'

describe('importRunRapportHandler — garde d’accès', () => {
  it('visiteur anonyme (pas de user) → 403, jamais de lecture Payload', async () => {
    const findByID = vi.fn()
    const res = await importRunRapportHandler(req(URL_RAPPORT, { user: null, findByID }))
    expect(res.status).toBe(403)
    expect(findByID).not.toHaveBeenCalled()
  })

  it('editor (pas admin) → 403 — panneau import réservé aux administrateur·rice·s', async () => {
    const findByID = vi.fn()
    const res = await importRunRapportHandler(
      req(URL_RAPPORT, { user: { role: 'editor' }, findByID }),
    )
    expect(res.status).toBe(403)
    expect(findByID).not.toHaveBeenCalled()
  })

  it('admin → passe la garde (lecture Payload déclenchée)', async () => {
    const findByID = vi.fn(async () => ({
      id: 7,
      createdAt: '2026-07-10T08:00:00.000Z',
      rapport: emptyReport(),
    }))
    const res = await importRunRapportHandler(
      req(URL_RAPPORT, { user: { role: 'admin' }, findByID }),
    )
    expect(res.status).toBe(200)
    expect(findByID).toHaveBeenCalled()
  })
})

describe('importRunRapportHandler — identifiant de run', () => {
  it('id non numérique dans routeParams → 400, jamais de lecture Payload', async () => {
    const findByID = vi.fn()
    const res = await importRunRapportHandler(
      req(URL_RAPPORT, { user: { role: 'admin' }, findByID, routeParams: { id: 'abc' } }),
    )
    expect(res.status).toBe(400)
    expect(findByID).not.toHaveBeenCalled()
  })

  it('run introuvable (findByID rejette) → 404', async () => {
    const findByID = vi.fn(async () => {
      throw new Error('not found')
    })
    const res = await importRunRapportHandler(
      req(URL_RAPPORT, { user: { role: 'admin' }, findByID }),
    )
    expect(res.status).toBe(404)
  })
})

describe('importRunRapportHandler — rapport stocké', () => {
  it('rapport illisible (forme inattendue en base) → 500', async () => {
    const findByID = vi.fn(async () => ({
      id: 7,
      createdAt: '2026-07-10T08:00:00.000Z',
      rapport: { inattendu: true },
    }))
    const res = await importRunRapportHandler(
      req(URL_RAPPORT, { user: { role: 'admin' }, findByID }),
    )
    expect(res.status).toBe(500)
  })

  it('rapport valide → CSV avec BOM UTF-8 et nom de fichier daté du run', async () => {
    const findByID = vi.fn(async () => ({
      id: 7,
      createdAt: '2026-07-10T08:00:00.000Z',
      rapport: {
        matched: [],
        routerRowsWithoutBook: 2,
        manualBooksNotInFile: [],
        routerBooksMissingFromFile: [{ title: 'Le Capital', isbn: null, slug: 'le-capital' }],
      },
    }))
    const res = await importRunRapportHandler(
      req(URL_RAPPORT, { user: { role: 'admin' }, findByID }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="import-routeur-rapport-2026-07-10.csv"',
    )
    // BOM v\u00E9rifi\u00E9 sur les OCTETS : `Response.text()` fait un UTF-8 decode, qui
    // retire la marque d'ordre en tete (spec Fetch) \u2014 cf. `order-export-handler.test.ts`.
    const octets = new Uint8Array(await res.clone().arrayBuffer())
    expect([octets[0], octets[1], octets[2]]).toEqual([0xef, 0xbb, 0xbf])
    const body = await res.text()
    expect(body).toContain('Le Capital')
  })
})
