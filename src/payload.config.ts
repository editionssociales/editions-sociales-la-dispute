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
import { attachPoolErrorHandler } from './payload/lib/pool-error-handler.ts'
import { PageAPropos } from './payload/globals/PageAPropos.ts'
import { PageContact } from './payload/globals/PageContact.ts'
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
  // Quotidien · Catalogue · Vie du site · Boutique · Administration &
  // technique · Pages du site.
  // Contrainte du framework (`groupNavItems.js`) : les collections sont
  // traitées en bloc avant les globals, donc un groupe qui ne compte AUCUNE
  // collection (uniquement des globals) est structurellement rejeté après
  // tous les groupes qui en comptent au moins une — quel que soit son rang de
  // première rencontre dans ce tableau. C'est le cas de « Pages du site »
  // (Pages des maisons, Page Contact, Mentions légales & pied de page) :
  // assumé, le plus statique atterrit en bas.
  collections: [
    Books,
    Orders,
    Authors,
    BookLabels,
    Media,
    Highlight,
    Rencontres,
    PromoCodes,
    Users,
    ImportRuns,
  ],
  globals: [PageSouscription, ReglagesBoutique, PageAPropos, PageContact, PagesLegales],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
      // Borne l'attente de `pool.connect()` (défaut pg : infinie) — couvre le
      // réveil d'un compute Neon autosuspendu sans laisser une saturation du
      // pool dégénérer en timeout de fonction Vercel silencieux.
      connectionTimeoutMillis: 15_000,
    },
    schemaName: 'payload',
    // Jamais de push en prod — le schéma vit dans des migrations versionnées
    // (`src/migrations/`, cf. E2 du plan).
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  // Sans listener `error` sur le pool pg, un client idle coupé par Neon
  // (autosuspend) fait tomber tout le process — cf. pool-error-handler.ts.
  onInit: attachPoolErrorHandler,
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
