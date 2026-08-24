import { addDataAndFileToRequest } from 'payload'
import type { Payload, PayloadHandler, PayloadRequest } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import { revalidateSouscriptionNow } from '../hooks/revalidate.ts'
import { parseVirementsWorkbook, type VirementIssue, type VirementRow } from './virements-import-core.ts'

/**
 * Orchestration I/O de l'import des virements de souscription (cœur pur dans
 * `virements-import-core.ts`, demande client 2026-08-24 consignée dans
 * `_specs/demandes-client-20260824.md`).
 *
 * Le classeur de l'équipe est CUMULATIF : il est réimporté en entier à chaque
 * ajout. L'import est donc un rapprochement, pas un ajout — chaque ligne est
 * appariée par `cleImport` (date + nom + montant, cf. le cœur) : absente en
 * base → créée ; présente et identique → laissée telle quelle (aucune
 * écriture, aucune purge inutile) ; présente et modifiée → mise à jour. Rien
 * n'est SUPPRIMÉ : les lignes en base absentes du fichier sont seulement
 * signalées dans le rapport (même parti pris que l'import routeur —
 * `stock-import.ts` — un import ne détruit jamais).
 *
 * Une saisie à la main (sans `cleImport`) n'est jamais touchée par un import.
 */

/** Une ligne en base sans correspondance dans le fichier — signalée, jamais supprimée. */
export interface VirementOrphelin {
  id: number
  nom: string
  montantEUR: number
  date: string
}

export interface VirementsImportResult {
  /** Lignes exploitables lues dans le classeur. */
  lues: number
  creees: number
  misesAJour: number
  inchangees: number
  /** Lignes du classeur écartées, avec leur numéro de ligne Excel et la raison. */
  ignorees: VirementIssue[]
  /** Lignes déjà en base et absentes du fichier (saisies à la main, ou retirées du classeur). */
  orphelines: VirementOrphelin[]
  /** Total collecté par virement APRÈS import (€) — le chiffre qui part dans la jauge. */
  totalEUR: number
}

/** Champs comparés/écrits — le `cleImport` n'en fait pas partie (c'est la clé, elle ne change jamais pour une ligne donnée). */
function rowData(row: VirementRow) {
  return {
    // Midi UTC : le champ est un jour, pas un instant. Posé à 00:00 UTC, il
    // s'afficherait la veille pour tout fuseau à l'ouest de Greenwich (piège
    // déjà rencontré sur les dates de parution) ; midi absorbe ±12 h.
    date: `${row.date}T12:00:00.000Z`,
    nom: row.nom,
    montantEUR: row.montantEUR,
    palier: row.palier,
    choixSaisi: row.choixSaisi,
    email: row.email,
    reference: row.reference,
  }
}

export async function importVirements(
  payload: Payload,
  buffer: Buffer,
  req?: PayloadRequest,
): Promise<VirementsImportResult> {
  const { rows, issues } = parseVirementsWorkbook(buffer)

  const { docs: existing } = await payload.find({
    collection: 'virements-souscription',
    depth: 0,
    limit: 0,
    overrideAccess: true,
    req,
  })
  const byKey = new Map(
    existing.flatMap((doc) => (doc.cleImport ? [[doc.cleImport, doc] as const] : [])),
  )

  let creees = 0
  let misesAJour = 0
  let inchangees = 0

  for (const row of rows) {
    const data = rowData(row)
    const found = byKey.get(row.cleImport)
    if (!found) {
      await payload.create({
        collection: 'virements-souscription',
        data: { ...data, cleImport: row.cleImport },
        overrideAccess: true,
        // UNE purge pour tout le run (plus bas) plutôt qu'une par ligne.
        context: { disableRevalidate: true },
        req,
      })
      creees++
      continue
    }
    const unchanged =
      found.nom === data.nom &&
      found.montantEUR === data.montantEUR &&
      (found.palier ?? null) === data.palier &&
      (found.choixSaisi ?? null) === data.choixSaisi &&
      (found.email ?? null) === data.email &&
      (found.reference ?? null) === data.reference &&
      typeof found.date === 'string' &&
      found.date.slice(0, 10) === row.date
    if (unchanged) {
      inchangees++
      continue
    }
    await payload.update({
      collection: 'virements-souscription',
      id: found.id,
      data,
      overrideAccess: true,
      context: { disableRevalidate: true },
      req,
    })
    misesAJour++
  }

  const cles = new Set(rows.map((row) => row.cleImport))
  const orphelines: VirementOrphelin[] = existing
    .filter((doc) => !doc.cleImport || !cles.has(doc.cleImport))
    .map((doc) => ({
      id: doc.id,
      nom: doc.nom,
      montantEUR: doc.montantEUR,
      date: typeof doc.date === 'string' ? doc.date.slice(0, 10) : '',
    }))

  // Total APRÈS import : les lignes du fichier + celles restées en base (une
  // saisie manuelle compte comme les autres dans la jauge).
  const totalEUR =
    rows.reduce((sum, row) => sum + row.montantEUR, 0) +
    orphelines.reduce((sum, doc) => sum + doc.montantEUR, 0)

  // Une seule purge pour tout le run — sans effet (warning) hors requête Next.
  if (creees > 0 || misesAJour > 0) revalidateSouscriptionNow()

  return {
    lues: rows.length,
    creees,
    misesAJour,
    inchangees,
    ignorees: issues,
    orphelines,
    totalEUR: Math.round(totalEUR * 100) / 100,
  }
}

/**
 * `POST /api/virements-souscription/import` (multipart, admin OU éditeur
 * authentifié) — consommé par le panneau au-dessus de la liste
 * (`src/payload/admin/virements/`). Même périmètre d'accès que l'écriture de
 * la collection (`isAdminOrEditor`), et non `isAdmin` comme l'import routeur :
 * l'import ne peut ni écraser un stock ni détruire une ligne, il ajoute des
 * contributions que l'équipe éditoriale saisirait sinon à la main.
 */
export const importVirementsHandler: PayloadHandler = async (req) => {
  if (isAdminOrEditor({ req }) !== true) {
    return Response.json({ error: 'Accès refusé.' }, { status: 403 })
  }

  await addDataAndFileToRequest(req)
  const file = req.file
  if (!file) {
    return Response.json({ error: 'Aucun fichier reçu.' }, { status: 400 })
  }

  try {
    const result = await importVirements(req.payload, file.data, req)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fichier illisible.'
    req.payload.logger.error(`[import-virements] échec : ${message}`)
    return Response.json({ error: message }, { status: 400 })
  }
}
