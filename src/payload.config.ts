import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { fr } from '@payloadcms/translations/languages/fr'
import { buildConfig } from 'payload'

import sharp from 'sharp'

import { Authors } from './payload/collections/Authors.ts'
import { BookCollections } from './payload/collections/BookCollections.ts'
import { Books } from './payload/collections/Books.ts'
import { Highlight } from './payload/collections/Highlight.ts'
import { ImportRuns } from './payload/collections/ImportRuns.ts'
import { Media } from './payload/collections/Media.ts'
import { Orders } from './payload/collections/Orders.ts'
import { PromoCodes } from './payload/collections/PromoCodes.ts'
import { Users } from './payload/collections/Users.ts'
import { ReglagesBoutique } from './payload/globals/ReglagesBoutique.ts'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      // Dashboard v2 (`_specs/dashboard-admin/design-v2.md`) : bandeau d'état
      // + panneaux 3.2→3.10 + codes promo expirés AVANT la grille native
      // `CollectionCards` (3.11, rendue par Payload entre les deux slots) ;
      // observabilité + configuration (3.12/3.13, rôle admin) APRÈS. Ces
      // composants absorbent les anciens StockImportPanel/StockLowWidget.
      beforeDashboard: ['/payload/admin/dashboard/Dashboard.tsx#Dashboard'],
      afterDashboard: ['/payload/admin/dashboard/DashboardFooter.tsx#DashboardFooter'],
    },
  },
  collections: [Users, Media, Authors, BookCollections, Books, Highlight, Orders, PromoCodes, ImportRuns],
  globals: [ReglagesBoutique],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    schemaName: 'payload',
    // Jamais de push en prod — le schéma vit dans des migrations versionnées
    // (`src/migrations/`, cf. E2 du plan).
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  i18n: {
    supportedLanguages: { fr },
    fallbackLanguage: 'fr',
  },
  graphQL: {
    disable: true,
  },
  // sharp épinglé en 0.34.x : Turbopack stable (≤ 16.2.x) ne trace pas le
  // libvips de sharp 0.35 dans les fonctions Vercel (next.js#94845, corrigé
  // en 16.3) → ERR_DLOPEN_FAILED sur /admin en prod. Repasser en 0.35+ lors
  // de la prochaine montée en tandem Next/Payload (Next ≥ 16.3 stable).
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [
    vercelBlobStorage({
      // Désactivé (fallback stockage local, cf. Media.ts) tant que
      // BLOB_READ_WRITE_TOKEN n'est pas posé dans l'environnement.
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      collections: {
        media: true,
      },
      token: process.env.BLOB_READ_WRITE_TOKEN || '',
      clientUploads: true,
    }),
  ],
})
