import { describe, expect, it, vi } from 'vitest'

import type { Payload, PayloadRequest } from 'payload'

import {
  createOrderExportHandler,
  exportComptaHandler,
  exportPreparationHandler,
} from './order-export-handler.ts'

/**
 * Orchestration de `GET /api/orders/export/{preparation,compta}` testée à
 * travers l'interface réelle du handler (`PayloadRequest → Response`, même
 * patron que `src/app/api/checkout/route.test.ts`) — seul `req.payload.find`
 * (le seam I/O nommé) est mocké.
 *
 * `exportPreparationHandler` et `exportComptaHandler` ne sont que deux appels
 * de `createOrderExportHandler` (garde d'accès, résolution `ids`/vue,
 * relecture, réponse CSV — corps commun) qui ne diffèrent que par le préfixe
 * du nom de fichier et la mise en forme des colonnes. Le mécanisme COMMUN se
 * verrouille donc une fois, sur un handler construit ici avec une mise en
 * forme minimale ; les deux exports RÉELS ne sont testés que sur ce qui les
 * distingue réellement : les colonnes (préparation vs compta) et la présence
 * de `stripeSessionId`.
 *
 * Deux priorités dans le commun : les gardes d'accès (`isAdminOrEditor` en
 * tête de handler) et le contrat « l'export EST la vue » — les filtres de la
 * liste back-office (`where[…]`, `search`, tels que Payload les parse dans
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

const URL_TEST = 'https://admin.exemple.test/api/orders/export/test'
const URL_PREP = 'https://admin.exemple.test/api/orders/export/preparation'
const URL_COMPTA = 'https://admin.exemple.test/api/orders/export/compta'

/**
 * Handler construit via la fabrique pour verrouiller le mécanisme commun,
 * indépendamment des deux vraies mises en forme (`formatPreparationCsv`,
 * `formatComptaCsv`, testées ailleurs sur les exports réels). La mise en
 * forme ici ne fait que rendre les numéros de commande visibles, pour les
 * assertions de contenu (« telle commande est bien sortie »).
 */
const testHandler = createOrderExportHandler({
  filenamePrefix: 'test-export',
  formatCsv: (rows) => rows.map((row) => row.number).join('\n'),
})

describe('createOrderExportHandler — garde d’accès (commun aux deux profils)', () => {
  it('visiteur anonyme (pas de user) → 403, jamais de lecture Payload', async () => {
    const { payload, find } = fakePayload()
    const res = await testHandler(req(URL_TEST, { user: null, payload }))
    expect(res.status).toBe(403)
    expect(find).not.toHaveBeenCalled()
  })

  it('rôle inconnu/viewer → 403, jamais de lecture Payload', async () => {
    const { payload, find } = fakePayload()
    const res = await testHandler(req(URL_TEST, { user: { role: 'viewer' }, payload }))
    expect(res.status).toBe(403)
    expect(find).not.toHaveBeenCalled()
  })

  it('editor → 200 (pas seulement admin)', async () => {
    const { payload } = fakePayload({ orders: [order()] })
    const res = await testHandler(req(URL_TEST, { user: { role: 'editor' }, payload }))
    expect(res.status).toBe(200)
  })

  it('admin → 200', async () => {
    const { payload } = fakePayload({ orders: [order()] })
    const res = await testHandler(req(URL_TEST, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(200)
  })
})

/**
 * Le contrat central : l'export EST la vue. Les filtres de la liste arrivent
 * dans `req.query` (Payload les parse depuis l'URL) et sont transmis tels
 * quels à la lecture — le handler ne les lit pas, ne les complète pas, n'en
 * ajoute aucun.
 */
describe('createOrderExportHandler — les lignes de la vue (commun aux deux profils)', () => {
  it('vue sans filtre → aucune clause `where`, toutes les commandes, sans pagination', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order()] })
    const res = await testHandler(req(URL_TEST, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(200)
    const ordersCall = findCalls.find((c) => c.collection === 'orders')
    expect(ordersCall).toMatchObject({ limit: 0, depth: 0, sort: 'createdAt' })
    expect(ordersCall).not.toHaveProperty('where')
  })

  it('filtre de la vue transmis VERBATIM, sans interprétation', async () => {
    const where = { or: [{ and: [{ orderType: { equals: 'don' } }] }] }
    const { payload, findCalls } = fakePayload({ orders: [order({ orderType: 'don' })] })
    const res = await testHandler(req(URL_TEST, { user: { role: 'admin' }, payload, query: { where } }))
    expect(res.status).toBe(200)
    expect(findCalls.find((c) => c.collection === 'orders')?.where).toEqual(where)
  })

  it('aucun statut imposé : une commande dans un statut quelconque sort si la vue la montre', async () => {
    const { payload } = fakePayload({ orders: [order({ status: 'shipped', number: 'CMD-000009' })] })
    const res = await testHandler(
      req(URL_TEST, { user: { role: 'admin' }, payload, query: { where: { status: { equals: 'shipped' } } } }),
    )
    expect(await res.text()).toContain('CMD-000009')
  })

  it('recherche de la liste → fusionnée en `or` sur les champs cherchables (comme la liste elle-même)', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order()] })
    const res = await testHandler(req(URL_TEST, { user: { role: 'admin' }, payload, query: { search: 'Dupont' } }))
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
    await testHandler(
      req(URL_TEST, {
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
    const res = await testHandler(
      req(URL_TEST, { user: { role: 'admin' }, payload, query: { where: { nimportequoi: { equals: 1 } } } }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('cannot be queried')
  })
})

/**
 * Sélection cochée (`ids`, checkboxes de la liste) : PRIME sur les filtres
 * de la vue, et ses erreurs sont EXPLICITES (parsing pur dans
 * `order-export.ts:parseExportOrderIds`, déjà testé — ici on verrouille
 * l'orchestration : priorité, aucune clause ajoutée, 400 sur `ids` illisible).
 */
describe('createOrderExportHandler — sélection cochée (`ids`, commun aux deux profils)', () => {
  it('`ids` posé → where = ces ids exactement, les filtres de la vue ne sont PAS lus', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order()] })
    const res = await testHandler(
      req(`${URL_TEST}?ids=12,45,109`, {
        user: { role: 'admin' },
        payload,
        // La vue porte AUSSI un filtre : il doit être ignoré, la sélection prime.
        query: { where: { orderType: { equals: 'don' } } },
      }),
    )
    expect(res.status).toBe(200)
    expect(findCalls.find((c) => c.collection === 'orders')?.where).toEqual({
      id: { in: [12, 45, 109] },
    })
  })

  it('aucun statut imposé non plus : une commande cochée sort quel que soit son statut', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order({ status: 'shipped' })] })
    const res = await testHandler(req(`${URL_TEST}?ids=42`, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(200)
    expect(findCalls.find((c) => c.collection === 'orders')?.where).toEqual({ id: { in: [42] } })
    expect(await res.text()).toContain('CMD-000001')
  })

  it('`ids` illisible → 400 qui nomme le segment fautif, jamais de lecture Payload', async () => {
    const { payload, find } = fakePayload()
    const res = await testHandler(req(`${URL_TEST}?ids=12,abc`, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('abc')
    expect(find).not.toHaveBeenCalled()
  })

  it('`ids` vide → pas une sélection : retombe sur les filtres de la vue', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order()] })
    const where = { status: { equals: 'refunded' } }
    await testHandler(req(`${URL_TEST}?ids=`, { user: { role: 'admin' }, payload, query: { where } }))
    expect(findCalls.find((c) => c.collection === 'orders')?.where).toEqual(where)
  })
})

describe('createOrderExportHandler — réponse CSV (commun aux deux profils)', () => {
  it('en-têtes CSV + nom de fichier daté (préfixe fourni à la fabrique) + BOM UTF-8', async () => {
    const { payload } = fakePayload({ orders: [order()] })
    const res = await testHandler(req(URL_TEST, { user: { role: 'admin' }, payload }))
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="test-export-\d{4}-\d{2}-\d{2}\.csv"$/,
    )
    // Le BOM se vérifie sur les OCTETS : `Response.text()` fait un UTF-8 decode,
    // qui RETIRE une marque d'ordre en tête (spec Fetch). Assertée sur la chaîne,
    // elle ne pourrait jamais passer — même si le handler l'émet bien, ce qu'il fait.
    const octets = new Uint8Array(await res.arrayBuffer())
    expect([octets[0], octets[1], octets[2]]).toEqual([0xef, 0xbb, 0xbf])
  })

  it('code promo résolu par une seconde lecture ciblée (promo-codes) uniquement si référencé', async () => {
    const { payload, findCalls } = fakePayload({
      orders: [order({ promoCode: 3 })],
      promoCodes: [{ id: 3, code: 'AGREG2027' }],
    })
    await testHandler(req(URL_TEST, { user: { role: 'admin' }, payload }))
    const promoCall = findCalls.find((c) => c.collection === 'promo-codes')
    expect(promoCall?.where).toEqual({ id: { in: [3] } })
  })

  it('aucune commande à code promo → pas de seconde lecture promo-codes', async () => {
    const { payload, findCalls } = fakePayload({ orders: [order({ promoCode: null })] })
    await testHandler(req(URL_TEST, { user: { role: 'admin' }, payload }))
    expect(findCalls.some((c) => c.collection === 'promo-codes')).toBe(false)
  })
})

/**
 * Les deux vraies différences entre profils : les colonnes (préparation vs
 * compta) et la présence de `stripeSessionId` — tout le reste (garde,
 * résolution `ids`/vue, réponse CSV générique) est verrouillé une fois
 * ci-dessus, sur le handler de test. Le nom de fichier propre à chaque
 * export réel (`commandes-preparation-*` / `commandes-compta-*`) est vérifié
 * ici aussi : c'est le seul autre paramètre qui distingue les deux appels de
 * la fabrique dans `order-export-handler.ts`.
 */
describe('exportPreparationHandler — colonnes de préparation', () => {
  it('editor → 200, nom de fichier "commandes-preparation-*"', async () => {
    const { payload } = fakePayload({ orders: [order()] })
    const res = await exportPreparationHandler(req(URL_PREP, { user: { role: 'editor' }, payload }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="commandes-preparation-\d{4}-\d{2}-\d{2}\.csv"$/,
    )
  })

  it('mappe orderType en libellé FR dans le CSV', async () => {
    const { payload } = fakePayload({ orders: [order({ orderType: 'precommande' })] })
    const res = await exportPreparationHandler(req(URL_PREP, { user: { role: 'admin' }, payload }))
    const csv = await res.text()
    expect(csv).toContain('Précommande')
  })

  it("n'expose PAS stripeSessionId (colonne compta uniquement, rapprochement)", async () => {
    const { payload } = fakePayload({ orders: [order({ stripeSessionId: 'cs_should_not_leak' })] })
    const res = await exportPreparationHandler(req(URL_PREP, { user: { role: 'admin' }, payload }))
    const csv = await res.text()
    expect(csv).not.toContain('cs_should_not_leak')
  })
})

describe('exportComptaHandler — colonnes comptables', () => {
  it('admin → 200, nom de fichier "commandes-compta-*"', async () => {
    const { payload } = fakePayload({ orders: [order()] })
    const res = await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="commandes-compta-\d{4}-\d{2}-\d{2}\.csv"$/,
    )
  })

  it('mappe orderType (libellé FR) et stripeSessionId dans le CSV', async () => {
    const { payload } = fakePayload({
      orders: [order({ orderType: 'precommande', stripeSessionId: 'cs_split_1' })],
    })
    const res = await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    const csv = await res.text()
    expect(csv).toContain('Précommande')
    expect(csv).toContain('cs_split_1')
  })

  it('stripeSessionId absent (null) → cellule vide dans le CSV, jamais "null"/"undefined"', async () => {
    const { payload } = fakePayload({ orders: [order({ stripeSessionId: null })] })
    const res = await exportComptaHandler(req(URL_COMPTA, { user: { role: 'admin' }, payload }))
    const csv = await res.text()
    expect(csv).not.toContain('null')
    expect(csv).not.toContain('undefined')
  })
})
