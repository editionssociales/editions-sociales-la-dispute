import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CollectionConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import {
  revalidateCatalogueAfterChange,
  revalidateCatalogueAfterDelete,
} from '../hooks/revalidate.ts'
import {
  revalidateCatalogueTagAfterChange,
  revalidateCatalogueTagAfterDelete,
} from '../hooks/revalidate-catalogue.ts'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Médias (images + PDF table des matières/extrait). Stockage local par défaut
 * (dev sans Vercel Blob configuré) ; le plugin `vercelBlobStorage` (voir
 * `payload.config.ts`) prend le dessus dès que `BLOB_READ_WRITE_TOKEN` est posé.
 *
 * `staticDir` cible le dossier `media/` gitignoré à la racine du dépôt
 * (`.gitignore` : `/media`). Ce fichier vit dans `src/payload/collections/` —
 * 3 niveaux sous la racine — d'où les 3 `..`.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Média',
    plural: 'Médias',
  },
  admin: {
    group: 'Catalogue',
    description:
      'Pour remplacer une image : téléversez un nouveau fichier plutôt que de la recadrer en place — ' +
      'sinon elle garde la même adresse et peut rester invisible en ligne pendant longtemps.',
  },
  upload: {
    mimeTypes: ['image/*', 'application/pdf'],
    staticDir: path.resolve(dirname, '../../../media'),
    // Pas d'`imageSizes` ici sans migration Postgres dédiée (colonnes
    // `sizes_*`) — le front public passe par next/image pour le redimensionnement.
  },
  access: {
    read: () => true,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    // Remplacer une couverture (ré-upload) doit rafraîchir les fiches qui
    // l'affichent — même levier qu'E6.
    afterChange: [revalidateCatalogueTagAfterChange, revalidateCatalogueAfterChange],
    afterDelete: [revalidateCatalogueTagAfterDelete, revalidateCatalogueAfterDelete],
  },
  fields: [
    {
      type: 'collapsible',
      label: 'Technique',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'alt',
          type: 'text',
          label: 'Texte alternatif',
          admin: {
            readOnly: true,
            description: 'Rempli automatiquement depuis le titre et les auteur·rice·s du livre.',
          },
        },
        {
          name: 'sourceUrl',
          type: 'text',
          unique: true,
          index: true,
          admin: {
            readOnly: true,
          },
        },
      ],
    },
  ],
}
