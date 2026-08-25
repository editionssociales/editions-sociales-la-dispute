import type { Payload, PayloadHandler, PayloadRequest, Where } from 'payload'

import { mergeListSearchAndWhere } from 'payload/shared'

import { isAdminOrEditor } from '../access.ts'
import {
  formatComptaCsv,
  formatPreparationCsv,
  type OrderExportRow,
} from '../../lib/order-export.ts'

/**
 * Orchestration I/O des deux exports CSV commandes (cœur pur de formatage
 * dans `src/lib/order-export.ts`) — même découpage que `stock-import.ts`
 * vis-à-vis de `stock-import-core.ts`.
 *
 * `GET /api/orders/export/preparation` et `GET /api/orders/export/compta`
 * exportent EXACTEMENT les lignes de la vue : le formulaire recopie tels
 * quels les paramètres de filtre de la liste back-office (`where[…]`,
 * `search`), ce handler les applique sans les interpréter. Aucun critère
 * propre, aucune borne implicite — ce que la liste affiche est ce que le CSV
 * contient, et les deux profils ne sont plus qu'une mise en forme des
 * colonnes (préparation/expédition vs compta).
 *
 * C'est le remplacement d'un système à critères séparés (bornes de dates et
 * type de commande saisis dans le panneau d'export), dont le client a
 * signalé qu'il ne suivait justement pas ce qu'il voyait à l'écran. Filtrer
 * se fait donc à UN seul endroit : la liste elle-même, avec toute la
 * puissance de ses filtres natifs (statut, type, dates, e-mail…).
 *
 * Le `where` vient d'un back-office authentifié (`isAdminOrEditor`) et ne
 * donne accès à rien de plus que le REST généré de la collection, sous les
 * mêmes droits ; Payload valide lui-même les champs et opérateurs cités.
 */

/** Tri FIXE, indépendant de celui de la liste : une feuille de préparation se lit dans l'ordre d'arrivée des commandes, et un tableur retrie de toute façon en un clic. */
const EXPORT_SORT = 'createdAt'

/**
 * `where` de la vue + recherche plein texte de la liste, fusionnés comme le
 * fait la liste elle-même (`mergeListSearchAndWhere`, utilitaire Payload :
 * la recherche devient un `or` sur `admin.listSearchableFields`, cf.
 * `Orders.ts`). `undefined` quand la vue n'a aucun filtre — l'export porte
 * alors sur toutes les commandes, exactement comme la liste.
 */
function whereFromView(req: PayloadRequest): Where | undefined {
  const query = (req.query ?? {}) as { where?: unknown; search?: unknown }
  const where =
    query.where && typeof query.where === 'object' ? (query.where as Where) : undefined
  const search = typeof query.search === 'string' ? query.search : ''
  if (!search) return where
  return mergeListSearchAndWhere({
    collectionConfig: req.payload.collections.orders.config,
    search,
    where,
  })
}

/**
 * Relit les commandes en `depth: 0` (les lignes portent déjà titre/ISBN/prix
 * en snapshot — `Orders.ts`, pas besoin de peupler `lines.book`) puis résout
 * le libellé du code promo par une seconde requête ciblée sur les seuls ids
 * référencés, plutôt qu'un `depth: 1` qui peuplerait aussi `lines.book` pour
 * rien (295 fiches potentiellement traversées en pure perte).
 */
async function fetchOrdersForExport(payload: Payload, where: Where | undefined): Promise<OrderExportRow[]> {
  const { docs } = await payload.find({
    collection: 'orders',
    ...(where ? { where } : {}),
    sort: EXPORT_SORT,
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

/**
 * Un filtre de vue illisible (URL forgée, champ inconnu) fait jeter Payload :
 * 400 avec son message plutôt qu'une 500 muette — l'équipe voit ce qui
 * cloche dans son filtre au lieu d'un export vide inexpliqué.
 */
function badFilter(req: PayloadRequest, err: unknown): Response {
  const message = err instanceof Error ? err.message : 'Filtre de liste illisible.'
  req.payload.logger.error(`[export-commandes] filtre refusé : ${message}`)
  return Response.json({ error: `Filtre de liste illisible : ${message}` }, { status: 400 })
}

/** `GET /api/orders/export/preparation` — colonnes de préparation/expédition, sur les lignes de la vue. */
export const exportPreparationHandler: PayloadHandler = async (req) => {
  if (isAdminOrEditor({ req }) !== true) return forbidden()
  try {
    const rows = await fetchOrdersForExport(req.payload, whereFromView(req))
    return csvResponse(`commandes-preparation-${todayStamp()}.csv`, formatPreparationCsv(rows))
  } catch (err) {
    return badFilter(req, err)
  }
}

/** `GET /api/orders/export/compta` — colonnes comptables (TVA ventilée), sur les lignes de la vue. */
export const exportComptaHandler: PayloadHandler = async (req) => {
  if (isAdminOrEditor({ req }) !== true) return forbidden()
  try {
    const rows = await fetchOrdersForExport(req.payload, whereFromView(req))
    return csvResponse(`commandes-compta-${todayStamp()}.csv`, formatComptaCsv(rows))
  } catch (err) {
    return badFilter(req, err)
  }
}
