import { describe, expect, it, vi } from 'vitest'

import type { Payload, PayloadRequest } from 'payload'

import { exportComptaHandler, exportPreparationHandler } from './order-export-handler.ts'

/**
 * Orchestration de `GET /api/orders/export/{preparation,compta}` testée à
 * travers l'interface réelle du handler (`PayloadRequest → Response`, même
 * patron que `src/app/api/checkout/route.test.ts`) — seul `req.payload.find`
 * (le seam I/O nommé) est mocké ; le formatage CSV (`src/lib/order-export.ts`)
 * tourne pour de vrai, c'est un module pur déjà couvert ailleurs.
 *
 * Priorité (issue #69) : les gardes d'accès (`isAdminOrEditor` en tête de
 * handler) et les bornes de date INCLUSIVES de `parseDateBounds`/
 * `normalizeFromBound`/`normalizeToBound`.
 */

interface FakeOrder {
  id: number
  number: string | null
  createdAt: string
  status: string
  email: string
  lines: Array<{
    book: number
    isbnSnapshot: string | null
    titleSnapshot: string
    quantity: number
    unitPriceTTC: number
  }>
  shippingAddress: Record<string, unknown>
  billingAddress: Record<string, unknown>
  totalTTC: number
  shippingCostTTC: number
  discountTTC: number | null
  promoCode: number | null
  stripePaymentIntentId: string | null
}

function order(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: 1,
    number: 'CMD-000001',
    createdAt: '2026-07-10T12:00:00.000Z',
    status: 'paid',
    email: 'client@exemple.test',
    lines: [
      {
        book: 12,
        isbnSnapshot: '978-1',
        titleSnapshot: 'Le Capital',
        quantity: 1,
        unitPriceTTC: 15,
      },
    ],
    shippingAddress: {
      fullName: 'Iel Client',
      addressLine1: '1 rue Test',
      postalCode: '75000',
      city: 'Paris',
      country: 'FR',
    },
    billingAddress: {
      fullName: 'Iel Client',
      addressLine1: '1 rue Test',
      postalCode: '75000',
      city: 'Paris',
      country: 'FR',
    },
    totalTTC: 15,
    shippingCostTTC: 0,
    discountTTC: 0,
    promoCode: null,
    stripePaymentIntentId: 'pi_test_1',
    ...overrides,
  }
}

interface FakePayloadOptions {
  orders?: FakeOrder[]
  promoCodes?: Array<{ id: number; code: string }>
}

function fakePayload({ orders = [], promoCodes = [] }: FakePayloadOptions = {}) {
  const findCalls: Array<Record<string, unknown>> = []
  const find = vi.fn(async (opts: Record<string, unknown>) => {
    findCalls.push(opts)
    if (opts.collection === 'orders') return { docs: orders }
    if (opts.collection === 'promo-codes') return { docs: promoCodes }
    return { docs: [] }
  })
  return { payload: { find } as unknown as Payload, find, findCalls }
}

function req(
  url: string,
  { user = null, payload }: { user?: { role: string } | null; payload: Payload },
): PayloadRequest {
  const request = new Request(url) as unknown as PayloadRequest
  Object.assign(request, {
    payload,
    user,
    context: {},
    searchParams: new URL(url).searchParams,
  })
  return request
}

const URL_PREP = 'https://admin.exemple.test/api/orders/export/preparation'
const URL_COMPTA = 'https://admin.exemple.test/api/orders/export/compta'

describe('exportPreparationHandler / exportComptaHandler — garde d’accès', () => {
  it('visiteur anonyme (pas de user) → 403, jamais de lecture Payload', async () => {
    const { payload, find } = fakePayload()
    const res = await exportPreparationHandler(req(URL_PREP, { user: null, payload }))
    expect(res.status).toBe(403)
    expect(find).not.toHaveBeenCalled()
  })

  it('rôle inconnu/viewer → 403 sur les deux exports', async () => {
    const { payload, find } = fakePayload()
    const viewer = { role: 'viewer' }
    const resPrep = await exportPreparationHandler(req(URL_PREP, { user: viewer, payload }))
    const resCompta = await exportComptaHandler(req(URL_COMPTA, { user: viewer, payload }))
    expect(resPrep.status).toBe(403)
    expect(resCompta.status).toBe(403)
    expect(find).not.toHaveBeenCalled()
  })

  it('editor → 200 (pas seulement admin)', async () => {
    const { payload } = fakePayload({ orders: [order()] })
    const res = await exportPreparationHandler(req(URL_PREP, { user: { role: 'editor' }, payload }))
    expect(res.status).toBe(200)
  })

  it('admin → 200', async () => {
    const { payload } = fakePayload({ orders: [order()] })
    const res = await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(200)
  })
})

describe('exportPreparationHandler / exportComptaHandler — bornes de date', () => {
  it('"from" invalide → 400, jamais de lecture Payload', async () => {
    const { payload, find } = fakePayload()
    const res = await exportComptaHandler(
      req(`${URL_COMPTA}?from=pas-une-date`, { user: { role: 'admin' }, payload }),
    )
    expect(res.status).toBe(400)
    expect(find).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.error).toContain('"from" invalide')
  })

  it('"to" invalide → 400, jamais de lecture Payload', async () => {
    const { payload, find } = fakePayload()
    const res = await exportComptaHandler(
      req(`${URL_COMPTA}?to=pas-une-date`, { user: { role: 'admin' }, payload }),
    )
    expect(res.status).toBe(400)
    expect(find).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.error).toContain('"to" invalide')
  })

  it('bornes AAAA-MM-JJ → "from" étendu à minuit UTC, "to" étendu à 23:59:59.999 UTC (borne incluse)', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order()] })
    const res = await exportComptaHandler(
      req(`${URL_COMPTA}?from=2026-07-01&to=2026-07-31`, { user: { role: 'admin' }, payload }),
    )
    expect(res.status).toBe(200)
    const ordersCall = findCalls.find((c) => c.collection === 'orders')
    expect(ordersCall?.where).toEqual({
      and: [
        { createdAt: { greater_than_equal: '2026-07-01T00:00:00.000Z' } },
        { createdAt: { less_than_equal: '2026-07-31T23:59:59.999Z' } },
      ],
    })
  })

  it('bornes ISO complètes → transmises SANS normalisation', async () => {
    const { payload, findCalls } = fakePayload({ orders: [] })
    const from = '2026-07-01T08:30:00.000Z'
    const to = '2026-07-31T18:00:00.000Z'
    await exportComptaHandler(
      req(`${URL_COMPTA}?from=${from}&to=${to}`, { user: { role: 'admin' }, payload }),
    )
    const ordersCall = findCalls.find((c) => c.collection === 'orders')
    expect(ordersCall?.where).toEqual({
      and: [
        { createdAt: { greater_than_equal: from } },
        { createdAt: { less_than_equal: to } },
      ],
    })
  })

  it('aucune borne → pas de clause "and" (toutes les commandes du profil)', async () => {
    const { payload, findCalls } = fakePayload({ orders: [] })
    await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    const ordersCall = findCalls.find((c) => c.collection === 'orders')
    expect(ordersCall?.where).toEqual({})
  })
})

describe('exportPreparationHandler — profil « préparation »', () => {
  it('filtre les commandes aux statuts paid/prepared', async () => {
    const { payload, findCalls } = fakePayload({ orders: [] })
    await exportPreparationHandler(req(URL_PREP, { user: { role: 'admin' }, payload }))
    const ordersCall = findCalls.find((c) => c.collection === 'orders')
    expect(ordersCall?.where).toEqual({
      and: [{ status: { in: ['paid', 'prepared'] } }],
    })
  })
})

describe('exportComptaHandler — profil « compta »', () => {
  it('ne filtre PAS par statut (tous statuts)', async () => {
    const { payload, findCalls } = fakePayload({ orders: [] })
    await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    const ordersCall = findCalls.find((c) => c.collection === 'orders')
    expect(ordersCall?.where).toEqual({})
  })
})

describe('exportPreparationHandler / exportComptaHandler — réponse CSV', () => {
  it('en-têtes CSV + nom de fichier daté + BOM UTF-8', async () => {
    const { payload } = fakePayload({ orders: [order()] })
    const res = await exportPreparationHandler(req(URL_PREP, { user: { role: 'admin' }, payload }))
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="commandes-preparation-\d{4}-\d{2}-\d{2}\.csv"$/,
    )
    const body = await res.text()
    expect(body.startsWith('\uFEFF')).toBe(true)
  })

  it('code promo résolu par une seconde lecture ciblée (promo-codes) uniquement si référencé', async () => {
    const { payload, findCalls } = fakePayload({
      orders: [order({ promoCode: 3 })],
      promoCodes: [{ id: 3, code: 'AGREG2027' }],
    })
    await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    const promoCall = findCalls.find((c) => c.collection === 'promo-codes')
    expect(promoCall?.where).toEqual({ id: { in: [3] } })
  })

  it('aucune commande à code promo → pas de seconde lecture promo-codes', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order({ promoCode: null })] })
    await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    expect(findCalls.some((c) => c.collection === 'promo-codes')).toBe(false)
  })
})
