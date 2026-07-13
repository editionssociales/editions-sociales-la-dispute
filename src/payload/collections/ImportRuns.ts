import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access.ts'
import { importRunRapportHandler } from '../lib/import-run-report-handler.ts'

/**
 * Historique des imports stock routeur (dashboard v2, panneau 3.7 —
 * `_specs/dashboard-admin/design-v2.md`). Un document par import RÉUSSI, créé
 * exclusivement par `importRouterStock` (`lib/stock-import.ts`, Local API
 * `overrideAccess`) — `create`/`update` fermés à toute autre voie, comme
 * `Orders`. Le `createdAt` des timestamps Payload EST la date d'import.
 *
 * Le rapport (`StockImportReport` sérialisé) vit en JSON dans le document et
 * est servi en CSV à la volée par `GET /api/import-runs/:id/rapport` — pas de
 * fichier Blob (écart assumé à la piste « urlRapport, stockage probable
 * Blob » de la spec : rapport borné, zéro dépendance de stockage en plus).
 */
export const ImportRuns: CollectionConfig = {
  slug: 'import-runs',
  labels: {
    singular: 'Import routeur',
    plural: 'Imports routeur',
  },
  admin: {
    defaultColumns: ['createdAt', 'nbLignes', 'nbMatchees'],
    description:
      "Historique des imports mensuels du fichier stock routeur — un " +
      "document par import réussi, créé automatiquement par l'import " +
      '(jamais à la main). Le dernier run alimente le panneau « Import ' +
      'routeur » du tableau de bord.',
    // Même règle que `Users` : invisible dans le menu pour un compte editor —
    // le vrai garde-fou reste l'access control ci-dessous.
    hidden: ({ user }) => user?.role !== 'admin',
  },
  access: {
    read: isAdmin,
    // Seul `importRouterStock` écrit (Local API, `overrideAccess: true`) ; un
    // run ne se modifie jamais après coup.
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  // `GET /api/import-runs/:id/rapport` — rapport CSV des non-appariés
  // (auth admin, CSV maison `;`/CRLF/BOM — cf. `import-run-report-handler.ts`).
  endpoints: [
    {
      path: '/:id/rapport',
      method: 'get',
      handler: importRunRapportHandler,
    },
  ],
  fields: [
    {
      name: 'nbLignes',
      type: 'number',
      required: true,
      label: 'Lignes traitées',
      admin: {
        readOnly: true,
        description: 'Lignes exploitables du fichier routeur (EAN présent).',
      },
    },
    {
      name: 'nbMatchees',
      type: 'number',
      required: true,
      label: 'Lignes appariées',
      admin: {
        readOnly: true,
        description: 'Fiches appariées par ISBN normalisé et mises à jour.',
      },
    },
    {
      name: 'rapport',
      type: 'json',
      label: 'Rapport',
      admin: {
        readOnly: true,
        description:
          'Rapport complet du run (`StockImportReport`) — les non-appariés ' +
          'se téléchargent en CSV via le tableau de bord.',
      },
    },
  ],
}
