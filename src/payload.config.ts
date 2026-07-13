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
import { Media } from './payload/collections/Media.ts'
import { Orders } from './payload/collections/Orders.ts'
import { PromoCodes } from './payload/collections/PromoCodes.ts'
import { Users } from './payload/collections/Users.ts'
import { PagesLegales } from './payload/globals/PagesLegales.ts'
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
      // Import stock routeur mensuel + alerte stock bas (mission — spec du
      // 12/07) : deux composants distincts dans le même slot, l'ordre fixe
      // l'ordre d'affichage sur le tableau de bord.
      beforeDashboard: [
        '/payload/admin/StockImportPanel.tsx#StockImportPanel',
        '/payload/admin/StockLowWidget.tsx#StockLowWidget',
      ],
    },
  },
  collections: [Users, Media, Authors, BookCollections, Books, Highlight, Orders, PromoCodes],
  globals: [ReglagesBoutique, PagesLegales],
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
