/**
 * Import one-shot des visuels de la campagne « Ils et elles nous
 * soutiennent » (affiches 4:5 livrées par Noémie, 2026-09-03) : crée un
 * média par affiche (upload — Vercel Blob dès que `BLOB_READ_WRITE_TOKEN`
 * est posé, stockage local sinon) avec son texte alternatif, puis RÉÉCRIT
 * le tableau `soutiens` du global `page-souscription` dans l'ordre du
 * tableau `VISUELS` — exactement l'état qu'aurait produit une saisie
 * manuelle au back-office (aucune légende : les affiches portent leur
 * texte, l'alt du média prend le relais — cf. `mergeSoutiens`,
 * `src/lib/site-content-core.ts`).
 *
 * Usage : `SOUTIENS_DIR=/chemin/des/jpegs pnpm import:soutiens`
 * Les fichiers attendus sont les JPEG PRÉPARÉS POUR LE WEB (≈ 1800×2250,
 * hors dépôt — les originaux de 9000×11250 pèsent 12 à 28 Mo pièce et
 * feraient ramer l'optimiseur d'images à chaque transformation).
 *
 * Idempotent par `media.sourceUrl` (`soutiens-2026/<fichier>`, clé unique de
 * la collection) : un média déjà importé est réutilisé, jamais dupliqué ; le
 * tableau `soutiens`, lui, est réécrit EN ENTIER à chaque run (toute saisie
 * manuelle antérieure du tableau est remplacée — les médias qu'elle
 * référençait restent dans la bibliothèque). Écritures avec
 * `context.disableRevalidate` (script hors requête Next — la purge de
 * `/souscription` vient du déploiement suivant ou du filet ISR 24 h).
 */
import fs from 'node:fs'
import path from 'node:path'

import { getPayload } from 'payload'

import config from '../src/payload.config.ts'

const VISUELS = [
  {
    fichier: 'soutien-2026-01-collectif.jpg',
    alt: 'Ils et elles nous soutiennent : les visages des soutiens de La Dispute et des éditions sociales. Et vous ?',
  },
  {
    fichier: 'soutien-2026-02-bernard-friot.jpg',
    alt: 'Bernard Friot, sociologue et économiste, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-03-michael-lowy.jpg',
    alt: 'Michael Löwy, philosophe, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-04-jean-luc-melenchon.jpg',
    alt: 'Jean-Luc Mélenchon, candidat de La France insoumise à l’élection présidentielle, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-05-andreas-malm.jpg',
    alt: 'Andreas Malm, géographe marxiste et activiste, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-06-adele-haenel.jpg',
    alt: 'Adèle Haenel, comédienne et militante, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-07-annie-ernaux.jpg',
    alt: 'Annie Ernaux, écrivaine, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-08-jean-quetier.jpg',
    alt: 'Jean Quétier, philosophe et spécialiste de Marx, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-09-aurore-koechlin.jpg',
    alt: 'Aurore Koechlin, sociologue et féministe, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-10-elsa-marcel.jpg',
    alt: 'Elsa Marcel, avocate et militante, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-11-eric-vuillard.jpg',
    alt: 'Éric Vuillard, écrivain, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-12-gilbert-achcar.jpg',
    alt: 'Gilbert Achcar, spécialiste du Moyen-Orient, soutient La Dispute et Les éditions sociales.',
  },
  {
    fichier: 'soutien-2026-13-clemence-guette.jpg',
    alt: 'Clémence Guetté, co-présidente de l’institut La Boétie, soutient La Dispute et Les éditions sociales.',
  },
] as const

async function run(): Promise<void> {
  const dir = process.env.SOUTIENS_DIR
  if (!dir) {
    throw new Error('SOUTIENS_DIR requis — dossier des JPEG préparés pour le web.')
  }
  for (const v of VISUELS) {
    if (!fs.existsSync(path.join(dir, v.fichier))) {
      throw new Error(`Fichier manquant : ${path.join(dir, v.fichier)} — rien n'a été écrit.`)
    }
  }

  const payload = await getPayload({ config })

  const ids: number[] = []
  for (const v of VISUELS) {
    const sourceUrl = `soutiens-2026/${v.fichier}`
    const existing = await payload.find({
      collection: 'media',
      where: { sourceUrl: { equals: sourceUrl } },
      limit: 1,
    })
    if (existing.totalDocs > 0) {
      const doc = existing.docs[0]
      payload.logger.info(`[import:soutiens] déjà importé : ${v.fichier} → media ${doc.id}`)
      ids.push(doc.id)
      continue
    }
    const created = await payload.create({
      collection: 'media',
      data: { alt: v.alt, sourceUrl },
      filePath: path.join(dir, v.fichier),
      context: { migration: true, disableRevalidate: true },
    })
    payload.logger.info(
      `[import:soutiens] créé : ${v.fichier} → media ${created.id} (${created.width}×${created.height})`,
    )
    ids.push(created.id)
  }

  await payload.updateGlobal({
    slug: 'page-souscription',
    data: { soutiens: ids.map((image) => ({ image })) },
    context: { migration: true, disableRevalidate: true },
  })
  payload.logger.info(
    `[import:soutiens] global page-souscription réécrit : ${ids.length} visuels, dans l'ordre de la campagne.`,
  )

  process.exit(0)
}

// Top-level await obligatoire : `payload run` fait `process.exit(0)` dès que
// l'import du module est résolu — un `run()` fire-and-forget serait tué avant
// d'avoir travaillé (même parti pris que `seed-users.ts`).
try {
  await run()
} catch (error) {
  console.error("[import:soutiens] Échec de l'import :", error)
  process.exit(1)
}
