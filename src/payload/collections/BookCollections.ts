import type { CollectionConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'

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
