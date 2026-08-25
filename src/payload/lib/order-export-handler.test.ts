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
 * Deux priorités : les gardes d'accès (`isAdminOrEditor` en tête de handler)
 * et le contrat « l'export EST la vue » — les filtres de la liste
 * back-office (`where[…]`, `search`, tels que Payload les parse dans
 * `req.query`) sont transmis à la lecture SANS être interprétés, et l'export
 * n'ajoute aucun critère de son cru.
 */

interface FakeOrder {
  id: number
  number: string | null
  orderType: string
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
  stripeSessionId: string | null
  stripePaymentIntentId: string | null
}

function order(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: 1,
    number: 'CMD-000001',
    orderType: 'commande',
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
    stripeSessionId: 'cs_test_1',
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
  // `collections.orders.config` : lu par `mergeListSearchAndWhere` (utilitaire
  // Payload) quand la vue porte une recherche — mêmes champs cherchables que
  // `Orders.ts:admin.listSearchableFields`.
  const collections = {
    orders: { config: { admin: { listSearchableFields: ['shippingAddress.fullName', 'number', 'email'] } } },
  }
  const logger = { error: vi.fn() }
  return { payload: { find, collections, logger } as unknown as Payload, find, findCalls }
}

/**
 * `query` reproduit ce que Payload dépose sur la requête après avoir parsé la
 * query string (qs) : `where[status][equals]=paid` arrive en objet imbriqué,
 * valeurs en chaînes — c'est cette forme-là que le handler transmet.
 */
function req(
  url: string,
  {
    user = null,
    payload,
    query = {},
  }: { user?: { role: string } | null; payload: Payload; query?: Record<string, unknown> },
): PayloadRequest {
  const request = new Request(url) as unknown as PayloadRequest
  Object.assign(request, {
    payload,
    user,
    context: {},
    query,
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

/**
 * Le contrat central : l'export EST la vue. Les filtres de la liste arrivent
 * dans `req.query` (Payload les parse depuis l'URL) et sont transmis tels
 * quels à la lecture — le handler ne les lit pas, ne les complète pas, n'en
 * ajoute aucun.
 */
describe('exportPreparationHandler / exportComptaHandler — les lignes de la vue', () => {
  it('vue sans filtre → aucune clause `where`, toutes les commandes, sans pagination', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order()] })
    const res = await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(200)
    const ordersCall = findCalls.find((c) => c.collection === 'orders')
    expect(ordersCall).toMatchObject({ limit: 0, depth: 0, sort: 'createdAt' })
    expect(ordersCall).not.toHaveProperty('where')
  })

  it('filtre de la vue transmis VERBATIM, sans interprétation', async () => {
    const where = { or: [{ and: [{ orderType: { equals: 'don' } }] }] }
    const { payload, findCalls } = fakePayload({ orders: [order({ orderType: 'don' })] })
    const res = await exportComptaHandler(
      req(URL_COMPTA, { user: { role: 'admin' }, payload, query: { where } }),
    )
    expect(res.status).toBe(200)
    expect(findCalls.find((c) => c.collection === 'orders')?.where).toEqual(where)
  })

  it('même filtre pour les deux profils : mêmes lignes, deux mises en forme', async () => {
    const where = { status: { equals: 'shipped' } }
    const prep = fakePayload({ orders: [order({ status: 'shipped' })] })
    const compta = fakePayload({ orders: [order({ status: 'shipped' })] })
    await exportPreparationHandler(req(URL_PREP, { user: { role: 'admin' }, payload: prep.payload, query: { where } }))
    await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload: compta.payload, query: { where } }))
    expect(prep.findCalls.find((c) => c.collection === 'orders')?.where).toEqual(where)
    expect(compta.findCalls.find((c) => c.collection === 'orders')?.where).toEqual(where)
  })

  it('aucun statut imposé : une commande expédiée sort de l’export préparation si la vue la montre', async () => {
    const { payload } = fakePayload({ orders: [order({ status: 'shipped', number: 'CMD-000009' })] })
    const res = await exportPreparationHandler(
      req(URL_PREP, { user: { role: 'admin' }, payload, query: { where: { status: { equals: 'shipped' } } } }),
    )
    expect(await res.text()).toContain('CMD-000009')
  })

  it('recherche de la liste → fusionnée en `or` sur les champs cherchables (comme la liste elle-même)', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order()] })
    const res = await exportComptaHandler(
      req(URL_COMPTA, { user: { role: 'admin' }, payload, query: { search: 'Dupont' } }),
    )
    expect(res.status).toBe(200)
    expect(findCalls.find((c) => c.collection === 'orders')?.where).toEqual({
      or: [
        { 'shippingAddress.fullName': { like: 'Dupont' } },
        { number: { like: 'Dupont' } },
        { email: { like: 'Dupont' } },
      ],
    })
  })

  it('recherche ET filtre → les deux, jamais l’un à la place de l’autre', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order()] })
    await exportComptaHandler(
      req(URL_COMPTA, {
        user: { role: 'admin' },
        payload,
        query: { search: 'Dupont', where: { orderType: { equals: 'commande' } } },
      }),
    )
    const where = findCalls.find((c) => c.collection === 'orders')?.where as Record<string, unknown>
    expect(where.and).toEqual([
      { orderType: { equals: 'commande' } },
      {
        or: [
          { 'shippingAddress.fullName': { like: 'Dupont' } },
          { number: { like: 'Dupont' } },
          { email: { like: 'Dupont' } },
        ],
      },
    ])
  })

  it('filtre refusé par Payload (champ inconnu) → 400 qui NOMME le problème, jamais une 500 muette', async () => {
    const { payload } = fakePayload()
    payload.find = vi.fn(async () => {
      throw new Error('The following path cannot be queried: nimportequoi')
    }) as unknown as Payload['find']
    const res = await exportComptaHandler(
      req(URL_COMPTA, { user: { role: 'admin' }, payload, query: { where: { nimportequoi: { equals: 1 } } } }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('cannot be queried')
  })
})

/**
 * Les deux profils lisaient autrefois des ensembles DIFFÉRENTS (préparation
 * = statuts payée/préparée, compta = tout). Ils lisent désormais le même :
 * celui de la vue. C'est le sens de la demande client — « juste exporter
 * l'ensemble des lignes de la vue » — et ce test le verrouille : aucun des
 * deux handlers ne rajoute de clause.
 */
describe('exportPreparationHandler / exportComptaHandler — aucun filtre propre', () => {
  it('ni l’un ni l’autre n’impose de statut', async () => {
    const prep = fakePayload({ orders: [] })
    const compta = fakePayload({ orders: [] })
    await exportPreparationHandler(req(URL_PREP, { user: { role: 'admin' }, payload: prep.payload }))
    await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload: compta.payload }))
    expect(prep.findCalls.find((c) => c.collection === 'orders')).not.toHaveProperty('where')
    expect(compta.findCalls.find((c) => c.collection === 'orders')).not.toHaveProperty('where')
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
    // Le BOM se v\u00E9rifie sur les OCTETS : `Response.text()` fait un UTF-8 decode,
    // qui RETIRE une marque d'ordre en tete (spec Fetch). Assert\u00E9e sur la cha\u00EEne,
    // elle ne pourrait jamais passer \u2014 m\u00EAme si le handler l'\u00E9met bien, ce qu'il fait.
    const octets = new Uint8Array(await res.arrayBuffer())
    expect([octets[0], octets[1], octets[2]]).toEqual([0xef, 0xbb, 0xbf])
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

describe('exportPreparationHandler / exportComptaHandler — mapping orderType/stripeSessionId (scission précommande)', () => {
  it('mappe orderType en libellé FR dans le CSV préparation', async () => {
    const { payload } = fakePayload({ orders: [order({ orderType: 'precommande' })] })
    const res = await exportPreparationHandler(req(URL_PREP, { user: { role: 'admin' }, payload }))
    const csv = await res.text()
    expect(csv).toContain('Précommande')
  })

  it("n'expose PAS stripeSessionId dans le CSV préparation (colonne compta uniquement, rapprochement)", async () => {
    const { payload } = fakePayload({ orders: [order({ stripeSessionId: 'cs_should_not_leak' })] })
    const res = await exportPreparationHandler(req(URL_PREP, { user: { role: 'admin' }, payload }))
    const csv = await res.text()
    expect(csv).not.toContain('cs_should_not_leak')
  })

  it('mappe orderType (libellé FR) et stripeSessionId dans le CSV compta', async () => {
    const { payload } = fakePayload({
      orders: [order({ orderType: 'precommande', stripeSessionId: 'cs_split_1' })],
    })
    const res = await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    const csv = await res.text()
    expect(csv).toContain('Précommande')
    expect(csv).toContain('cs_split_1')
  })

  it('stripeSessionId absent (null) → cellule vide dans le CSV compta, jamais "null"/"undefined"', async () => {
    const { payload } = fakePayload({ orders: [order({ stripeSessionId: null })] })
    const res = await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    const csv = await res.text()
    expect(csv).not.toContain('null')
    expect(csv).not.toContain('undefined')
  })
})
