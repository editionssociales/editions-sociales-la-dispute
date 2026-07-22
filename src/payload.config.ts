import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { fr } from '@payloadcms/translations/languages/fr'
import { buildConfig } from 'payload'

import sharp from 'sharp'

import { Authors } from './payload/collections/Authors.ts'
import { BookLabels } from './payload/collections/BookLabels.ts'
import { Books } from './payload/collections/Books.ts'
import { Highlight } from './payload/collections/Highlight.ts'
import { ImportRuns } from './payload/collections/ImportRuns.ts'
import { Media } from './payload/collections/Media.ts'
import { Orders } from './payload/collections/Orders.ts'
import { PromoCodes } from './payload/collections/PromoCodes.ts'
import { Rencontres } from './payload/collections/Rencontres.ts'
import { Users } from './payload/collections/Users.ts'
import { PageAPropos } from './payload/globals/PageAPropos.ts'
import { PageSouscription } from './payload/globals/PageSouscription.ts'
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
      // Home allégée : file du jour + alertes promo + raccourcis (plus de
      // bandeau ni panneau stock). Stock → `views.stock` ; Santé →
      // `views.sante`. Grille `CollectionCards` masquée (`custom.scss`).
      beforeDashboard: ['/payload/admin/dashboard/Dashboard.tsx#Dashboard'],
      views: {
        stock: {
          Component: '/payload/admin/stock/StockPage.tsx#StockPage',
          meta: { title: 'Stock' },
          path: '/stock',
        },
        sante: {
          Component: '/payload/admin/health/HealthPage.tsx#HealthPage',
          meta: { title: 'Santé' },
          path: '/sante',
        },
        nouveauLivre: {
          Component: '/payload/admin/books/NewBookView.tsx#NewBookView',
          meta: { title: 'Nouveau livre' },
          path: '/nouveau-livre',
        },
      },
      afterNavLinks: [
        '/payload/admin/stock/StockNavLink.tsx#StockNavLink',
        '/payload/admin/health/HealthNavLink.tsx#HealthNavLink',
      ],
    },
  },
  // L'ordre de déclaration EST le menu admin : la nav groupe collections ET
  // globals par `admin.group`, dans l'ordre de rencontre ci-dessous — groupes
  // Quotidien · Catalogue · Boutique · Site · Administration.
  collections: [
    Books,
    Orders,
    Authors,
    BookLabels,
    Media,
    PromoCodes,
    ImportRuns,
    Highlight,
    Rencontres,
    Users,
  ],
  globals: [ReglagesBoutique, PageAPropos, PageSouscription, PagesLegales],
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
