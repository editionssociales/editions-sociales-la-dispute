import { addDataAndFileToRequest } from 'payload'
import type { Payload, PayloadHandler, PayloadRequest } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import {
  matchStock,
  parseRouterWorkbook,
  type BookRef,
  type StockImportReport,
} from './stock-import-core.ts'

/**
 * Orchestration I/O de l'import stock routeur (cœur pur dans
 * `stock-import-core.ts`, mission « import mensuel + widget stock bas »).
 *
 * Univers d'appariement : tous les livres `origin: 'catalogue'` — jamais la
 * boutique/les goodies (mission point 3, saisie manuelle). Publiés ou non :
 * le stock physique routeur est une donnée opérationnelle, indépendante du
 * statut éditorial d'une fiche (une fiche « à paraître » peut déjà avoir du
 * stock chez l'imprimeur/le routeur).
 *
 * Chaque fiche appariée passe (ou reste) en `stockSuivi: 'routeur'` — c'est
 * l'import qui recrute dans ce mode, jamais une saisie humaine (décision
 * client du 12/07 : hors routeur = suivi manuel, comme les goodies). Les
 * fiches « routeur » absentes du fichier ne sont PAS touchées : stock
 * conservé tel quel, mode conservé — l'alerte `routerBooksMissingFromFile`
 * persiste au prochain import tant que l'anomalie n'est pas résolue.
 *
 * Écriture en `data.commerce` complet (valeurs existantes + `stock`/
 * `stockSuivi`/`stockUpdatedAt` écrasés) plutôt qu'un patch partiel du
 * sous-groupe : évite de s'appuyer sur la sémantique de fusion de Payload
 * pour un champ groupe, la fiche étant de toute façon déjà chargée pour
 * l'appariement.
 */

export interface StockImportResult extends StockImportReport {
  /** X du rapport (mission point 4) — nombre de fiches réellement écrites. */
  updatedCount: number
}

export async function importRouterStock(
  payload: Payload,
  buffer: Buffer,
  req?: PayloadRequest,
): Promise<StockImportResult> {
  const routerRows = parseRouterWorkbook(buffer)

  const { docs } = await payload.find({
    collection: 'books',
    where: { origin: { equals: 'catalogue' } },
    depth: 0,
    limit: 0,
    overrideAccess: true,
    req,
  })

  const books: BookRef[] = docs.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    isbn: doc.isbn ?? null,
    stockSuivi: doc.commerce?.stockSuivi ?? null,
  }))

  const report = matchStock(routerRows, books)
  const stockUpdatedAt = new Date().toISOString()

  for (const entry of report.matched) {
    const existing = docs.find((doc) => doc.id === entry.bookId)
    await payload.update({
      collection: 'books',
      id: entry.bookId,
      data: {
        commerce: {
          ...(existing?.commerce ?? {}),
          stock: entry.stock,
          stockSuivi: 'routeur',
          stockUpdatedAt,
        },
      },
      // Import mensuel, pas une édition humaine : ni revalidation Next (295
      // fiches en série), ni `contentTouched` (bascule Lexical) — même garde
      // que `scripts/migrate-catalogue`/`migrate-products.ts` (CLAUDE.md).
      context: { migration: true, disableRevalidate: true },
      overrideAccess: true,
      req,
    })
  }

  return { ...report, updatedCount: report.matched.length }
}

/**
 * `POST /api/books/import-stock` (multipart, admin/éditeur authentifié) —
 * consommé par la vue « Import stock »
 * (`src/payload/admin/StockImportPanel.tsx`).
 */
export const importStockHandler: PayloadHandler = async (req) => {
  if (isAdminOrEditor({ req }) !== true) {
    return Response.json(
      { error: 'Accès refusé — réservé aux administrateur·rice·s et éditrice·eur·s.' },
      { status: 403 },
    )
  }

  await addDataAndFileToRequest(req)
  const file = req.file
  if (!file) {
    return Response.json({ error: 'Aucun fichier reçu.' }, { status: 400 })
  }

  try {
    const result = await importRouterStock(req.payload, file.data, req)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fichier illisible.'
    req.payload.logger.error(`[import-stock] échec : ${message}`)
    return Response.json({ error: message }, { status: 400 })
  }
}
