import type { CollectionConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import {
  revalidateCatalogueAfterChange,
  revalidateCatalogueAfterDelete,
} from '../hooks/revalidate.ts'

/**
 * Collections éditoriales (slug Payload `collections`, distinct de la notion
 * de "collections" au sens config Payload). Chaque maison a son propre
 * "hors-collection" — d'où l'unicité composite `(edition, slug)` plutôt
 * qu'une unicité globale sur `slug` seul.
 */
export const BookCollections: CollectionConfig = {
  slug: 'collections',
  labels: {
    singular: 'Collection',
    plural: 'Collections',
  },
  admin: {
    useAsTitle: 'name',
  },
  access: {
    read: () => true,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    // Le nom d'une collection éditoriale apparaît sur toute fiche livre
    // rattachée (facette catalogue comprise) — même levier qu'E6.
    afterChange: [revalidateCatalogueAfterChange],
    afterDelete: [revalidateCatalogueAfterDelete],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nom',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
    },
    {
      name: 'edition',
      type: 'select',
      required: true,
      label: 'Maison',
      options: [
        { value: 'editions-sociales', label: 'Éditions sociales' },
        { value: 'la-dispute', label: 'La Dispute' },
      ],
    },
  ],
  indexes: [{ fields: ['edition', 'slug'], unique: true }],
}
