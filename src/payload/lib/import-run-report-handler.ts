import type { PayloadHandler } from 'payload'

import { isAdmin } from '../access.ts'
import {
  formatImportRunReportCsv,
  parseStoredImportReport,
} from './import-run-report-core.ts'

/**
 * `GET /api/import-runs/:id/rapport` — rapport CSV des non-appariés d'un run
 * d'import routeur (dashboard v2, panneau 3.7). Le CSV est produit À LA VOLÉE
 * depuis le champ `rapport` (JSON en base) : pas de fichier stocké (décision
 * du chantier — écart assumé au « stockage probable Blob » de la spec §3.7 :
 * rapport borné à quelques centaines de lignes, aucune dépendance Blob à
 * introduire pour ça). Auth `isAdmin`, comme tout le panneau import (geste
 * sensible) ; téléchargé par lien direct (cookie Payload), même principe que
 * `order-export-handler.ts`.
 */
export const importRunRapportHandler: PayloadHandler = async (req) => {
  if (isAdmin({ req }) !== true) {
    return Response.json(
      { error: 'Accès refusé — réservé aux administrateur·rice·s.' },
      { status: 403 },
    )
  }

  const rawId = req.routeParams?.id
  const id = Number(typeof rawId === 'string' ? rawId : NaN)
  if (!Number.isInteger(id)) {
    return Response.json({ error: `Identifiant de run invalide : ${String(rawId)}` }, { status: 400 })
  }

  const run = await req.payload
    .findByID({ collection: 'import-runs', id, depth: 0, overrideAccess: true, req })
    .catch(() => null)
  if (!run) {
    return Response.json({ error: `Aucun run d'import n° ${id}.` }, { status: 404 })
  }

  const report = parseStoredImportReport(run.rapport)
  if (!report) {
    return Response.json(
      { error: `Rapport du run n° ${id} illisible (forme inattendue en base).` },
      { status: 500 },
    )
  }

  // BOM UTF-8 : Excel (FR) n'infère l'UTF-8 qu'avec la marque (cf. `order-export-handler.ts`).
  return new Response(`\uFEFF${formatImportRunReportCsv(report)}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="import-routeur-rapport-${run.createdAt.slice(0, 10)}.csv"`,
    },
  })
}
