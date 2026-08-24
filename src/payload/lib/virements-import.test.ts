import * as XLSX from 'xlsx'
import { describe, expect, it, vi } from 'vitest'

import type { Payload, PayloadRequest } from 'payload'

/**
 * Orchestration de `POST /api/virements-souscription/import` testée à travers
 * l'interface réelle du handler (`PayloadRequest → Response`) — même patron
 * que `stock-import.test.ts` : `addDataAndFileToRequest` et les I/O Payload
 * sont les seuls seams mockés, le cœur pur (`virements-import-core.ts`)
 * tourne pour de vrai sur un classeur fabriqué en mémoire.
 *
 * Ce qui compte ici : la garde d'accès, et surtout l'IDEMPOTENCE — le
 * classeur de l'équipe est cumulatif, réimporté en entier à chaque ajout ;
 * un ré-import ne doit ni dupliquer, ni réécrire, ni supprimer.
 */

let nextFile: { data: Buffer; name: string; mimetype: string; size: number } | null = null

vi.mock('payload', () => ({
  addDataAndFileToRequest: vi.fn(async (req: PayloadRequest) => {
    if (nextFile) req.file = nextFile
  }),
}))

const { importVirementsHandler } = await import('./virements-import.ts')

const HEADER = ['Date', 'Nom', 'Montant', 'Choix de la souscription']

function classeur(rows: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([HEADER, ...rows])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Suivi')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function fichier(rows: unknown[][]) {
  return {
    data: classeur(rows),
    name: 'virements.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 100,
  }
}

interface FakeVirementDoc {
  id: number
  date: string
  nom: string
  montantEUR: number
  palier?: string | null
  choixSaisi?: string | null
  email?: string | null
  reference?: string | null
  cleImport?: string | null
}

function fakePayload(docs: FakeVirementDoc[]) {
  const find = vi.fn(async () => ({ docs }))
  const update = vi.fn(async (_args: Record<string, unknown>) => ({}))
  const create = vi.fn(async (_args: Record<string, unknown>) => ({}))
  const logger = { error: vi.fn() }
  return { payload: { find, update, create, logger } as unknown as Payload, find, update, create }
}

function req({ user, payload }: { user: { role: string } | null; payload: Payload }): PayloadRequest {
  const url = 'https://admin.exemple.test/api/virements-souscription/import'
  const request = new Request(url, { method: 'POST' }) as unknown as PayloadRequest
  Object.assign(request, { payload, user, context: {}, searchParams: new URL(url).searchParams })
  return request
}

describe('importVirementsHandler — garde d’accès', () => {
  it('visiteur anonyme → 403, jamais de lecture Payload', async () => {
    nextFile = null
    const { payload, find } = fakePayload([])
    const res = await importVirementsHandler(req({ user: null, payload }))
    expect(res.status).toBe(403)
    expect(find).not.toHaveBeenCalled()
  })

  it('editor autorisé — l’import n’écrase rien, contrairement à l’import routeur (admin seul)', async () => {
    nextFile = fichier([['24/08/2026', 'Marie Dupont', 50, 'Coup de pouce']])
    const { payload, create } = fakePayload([])
    const res = await importVirementsHandler(req({ user: { role: 'editor' }, payload }))
    expect(res.status).toBe(200)
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('importVirementsHandler — fichier', () => {
  it('aucun fichier reçu → 400', async () => {
    nextFile = null
    const { payload } = fakePayload([])
    const res = await importVirementsHandler(req({ user: { role: 'admin' }, payload }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Aucun fichier reçu.')
  })

  it('classeur sans les colonnes attendues → 400 avec un message pour l’équipe, aucune écriture', async () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Truc', 'Machin']]), 'Suivi')
    nextFile = {
      data: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      name: 'virements.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 100,
    }
    const { payload, create, update } = fakePayload([])
    const res = await importVirementsHandler(req({ user: { role: 'admin' }, payload }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('montant')
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('importVirementsHandler — rapprochement (le classeur est cumulatif)', () => {
  it('base vide → création, date posée à midi UTC (le jour reste le bon quel que soit le fuseau)', async () => {
    nextFile = fichier([['24/08/2026', 'Marie Dupont', '50,00 €', 'Camarade de lecture']])
    const { payload, create } = fakePayload([])
    const res = await importVirementsHandler(req({ user: { role: 'admin' }, payload }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ lues: 1, creees: 1, misesAJour: 0, inchangees: 0, totalEUR: 50 })
    expect(create.mock.calls[0][0]).toMatchObject({
      collection: 'virements-souscription',
      data: {
        date: '2026-08-24T12:00:00.000Z',
        nom: 'Marie Dupont',
        montantEUR: 50,
        palier: 'palier-50',
        choixSaisi: 'Camarade de lecture',
        cleImport: '2026-08-24|marie dupont|50.00',
      },
      // Une seule purge pour tout le run, jamais une par ligne.
      context: { disableRevalidate: true },
    })
  })

  it('ré-import du MÊME fichier → zéro écriture (ni doublon ni réécriture)', async () => {
    nextFile = fichier([['24/08/2026', 'Marie Dupont', 50, 'Camarade de lecture']])
    const { payload, create, update } = fakePayload([
      {
        id: 1,
        date: '2026-08-24T12:00:00.000Z',
        nom: 'Marie Dupont',
        montantEUR: 50,
        palier: 'palier-50',
        choixSaisi: 'Camarade de lecture',
        cleImport: '2026-08-24|marie dupont|50.00',
      },
    ])
    const res = await importVirementsHandler(req({ user: { role: 'admin' }, payload }))
    expect(await res.json()).toMatchObject({ creees: 0, misesAJour: 0, inchangees: 1, totalEUR: 50 })
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('ligne corrigée dans le classeur (choix complété) → mise à jour, pas un doublon', async () => {
    nextFile = fichier([['24/08/2026', 'Marie Dupont', 50, 'Camarade de lecture']])
    const { payload, create, update } = fakePayload([
      {
        id: 7,
        date: '2026-08-24T12:00:00.000Z',
        nom: 'Marie Dupont',
        montantEUR: 50,
        palier: null,
        choixSaisi: null,
        cleImport: '2026-08-24|marie dupont|50.00',
      },
    ])
    const res = await importVirementsHandler(req({ user: { role: 'admin' }, payload }))
    expect(await res.json()).toMatchObject({ creees: 0, misesAJour: 1, inchangees: 0 })
    expect(create).not.toHaveBeenCalled()
    expect(update.mock.calls[0][0]).toMatchObject({ id: 7, data: { palier: 'palier-50' } })
  })

  it('ligne en base absente du fichier → SIGNALÉE, jamais supprimée, et toujours comptée dans le total', async () => {
    nextFile = fichier([['24/08/2026', 'Marie Dupont', 50, '']])
    const { payload } = fakePayload([
      {
        id: 3,
        date: '2026-08-01T12:00:00.000Z',
        nom: 'Saisie à la main',
        montantEUR: 20,
        cleImport: null,
      },
    ])
    const res = await importVirementsHandler(req({ user: { role: 'admin' }, payload }))
    const body = await res.json()
    expect(body.orphelines).toEqual([
      { id: 3, nom: 'Saisie à la main', montantEUR: 20, date: '2026-08-01' },
    ])
    expect(body.totalEUR).toBe(70)
  })

  it('lignes illisibles → les bonnes passent quand même, les autres ressortent numérotées', async () => {
    nextFile = fichier([
      ['24/08/2026', 'Marie Dupont', 50, ''],
      ['', 'Jean Martin', 100, ''],
    ])
    const { payload, create } = fakePayload([])
    const res = await importVirementsHandler(req({ user: { role: 'admin' }, payload }))
    const body = await res.json()
    expect(body).toMatchObject({ lues: 1, creees: 1 })
    expect(body.ignorees).toEqual([{ ligne: 3, raison: 'date illisible ou manquante (Jean Martin) — formats acceptés : 24/08/2026, 2026-08-24, ou une cellule au format date' }])
    expect(create).toHaveBeenCalledTimes(1)
  })
})
