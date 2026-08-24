import type { Payload, PayloadHandler, Where } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import {
  formatComptaCsv,
  formatPreparationCsv,
  PREPARATION_ORDER_STATUSES,
  type OrderExportRow,
} from '../../lib/order-export.ts'

/**
 * Orchestration I/O des deux exports CSV commandes (cœur pur de formatage
 * dans `src/lib/order-export.ts`, mission « exports compta + livraison de la
 * PR », plan §4 étape 10) — même découpage que `stock-import.ts` vis-à-vis de
 * `stock-import-core.ts`.
 *
 * `GET /api/orders/export/preparation` et `GET /api/orders/export/compta`,
 * bornes de dates en paramètres (`from`/`to`, `AAAA-MM-JJ` ou ISO complet) —
 * cf. `src/payload/admin/OrderExportPanel.tsx` pour la vue qui les pose.
 */

interface DateBounds {
  from?: string
  to?: string
}

type ParsedBounds = DateBounds | { error: string }

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Une borne `AAAA-MM-JJ` (sans heure) est étendue à minuit UTC — début de journée, adapté à `from`. */
function normalizeFromBound(value: string): string {
  return DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value
}

/** Une borne `AAAA-MM-JJ` (sans heure) est étendue à 23:59:59.999 UTC — fin de journée INCLUSE, adapté à `to` (sinon une commande du jour même serait exclue par `less_than_equal` à minuit). */
function normalizeToBound(value: string): string {
  return DATE_ONLY.test(value) ? `${value}T23:59:59.999Z` : value
}

/** `req.searchParams` (`from`/`to`) → bornes validées, ou message d'erreur si l'une des deux ne se parse pas en date. */
function parseDateBounds(searchParams: URLSearchParams): ParsedBounds {
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from && Number.isNaN(Date.parse(from))) {
    return { error: `Paramètre "from" invalide (attendu AAAA-MM-JJ) : ${from}` }
  }
  if (to && Number.isNaN(Date.parse(to))) {
    return { error: `Paramètre "to" invalide (attendu AAAA-MM-JJ) : ${to}` }
  }
  return { from: from ?? undefined, to: to ?? undefined }
}

interface FetchOrdersOptions extends DateBounds {
  /** Restreint aux statuts donnés (profil « préparation ») — absent = tous statuts (profil « compta »). */
  statuses?: readonly string[]
}

/**
 * Relit les commandes en `depth: 0` (les lignes portent déjà titre/ISBN/prix
 * en snapshot — `Orders.ts`, pas besoin de peupler `lines.book`) puis résout
 * le libellé du code promo par une seconde requête ciblée sur les seuls ids
 * référencés, plutôt qu'un `depth: 1` qui peuplerait aussi `lines.book` pour
 * rien (295 fiches potentiellement traversées en pure perte).
 */
async function fetchOrdersForExport(payload: Payload, opts: FetchOrdersOptions): Promise<OrderExportRow[]> {
  const and: Where[] = []
  if (opts.from) and.push({ createdAt: { greater_than_equal: normalizeFromBound(opts.from) } })
  if (opts.to) and.push({ createdAt: { less_than_equal: normalizeToBound(opts.to) } })
  if (opts.statuses) and.push({ status: { in: opts.statuses as string[] } })

  const { docs } = await payload.find({
    collection: 'orders',
    where: and.length > 0 ? { and } : {},
    sort: 'createdAt',
    depth: 0,
    limit: 0,
    overrideAccess: true,
  })

  const promoIds = [...new Set(docs.map((order) => order.promoCode).filter((id): id is number => typeof id === 'number'))]
  const codeById = new Map<number, string>()
  if (promoIds.length > 0) {
    const { docs: promoDocs } = await payload.find({
      collection: 'promo-codes',
      where: { id: { in: promoIds } },
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    for (const promo of promoDocs) {
      codeById.set(promo.id, promo.code)
    }
  }

  return docs.map((order) => ({
    number: order.number ?? `#${order.id}`,
    orderType: order.orderType,
    createdAt: order.createdAt,
    status: order.status,
    email: order.email,
    phone: order.phone ?? null,
    lines: (order.lines ?? []).map((line) => ({
      bookId: typeof line.book === 'number' ? line.book : line.book.id,
      isbn: line.isbnSnapshot ?? null,
      title: line.titleSnapshot,
      quantity: line.quantity,
      unitPriceTTC: line.unitPriceTTC,
    })),
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    totalTTC: order.totalTTC,
    shippingCostTTC: order.shippingCostTTC,
    discountTTC: order.discountTTC ?? 0,
    couponCode: typeof order.promoCode === 'number' ? (codeById.get(order.promoCode) ?? null) : null,
    stripeSessionId: order.stripeSessionId,
    stripePaymentIntentId: order.stripePaymentIntentId ?? null,
  }))
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

/** BOM UTF-8 en tête : Excel (FR) n'infère l'UTF-8 qu'avec la marque — sans elle, les accents des titres/adresses s'affichent mal à l'ouverture directe. */
function csvResponse(filename: string, body: string): Response {
  return new Response(`\uFEFF${body}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function forbidden(): Response {
  return Response.json(
    { error: 'Accès refusé — réservé aux administrateur·rice·s et éditrice·eur·s.' },
    { status: 403 },
  )
}

/** `GET /api/orders/export/preparation` — profil « préparation » (décalque AOE, statuts `paid`/`prepared` uniquement). */
export const exportPreparationHandler: PayloadHandler = async (req) => {
  if (isAdminOrEditor({ req }) !== true) return forbidden()

  const bounds = parseDateBounds(req.searchParams)
  if ('error' in bounds) return Response.json(bounds, { status: 400 })

  const rows = await fetchOrdersForExport(req.payload, { ...bounds, statuses: PREPARATION_ORDER_STATUSES })
  return csvResponse(`commandes-preparation-${todayStamp()}.csv`, formatPreparationCsv(rows))
}

/** `GET /api/orders/export/compta` — profil « compta » (tous statuts, ventilation TVA). */
export const exportComptaHandler: PayloadHandler = async (req) => {
  if (isAdminOrEditor({ req }) !== true) return forbidden()

  const bounds = parseDateBounds(req.searchParams)
  if ('error' in bounds) return Response.json(bounds, { status: 400 })

  const rows = await fetchOrdersForExport(req.payload, bounds)
  return csvResponse(`commandes-compta-${todayStamp()}.csv`, formatComptaCsv(rows))
}
