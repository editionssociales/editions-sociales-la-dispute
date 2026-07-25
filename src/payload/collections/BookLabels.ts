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
import { deriveSlugFromLabel } from '../lib/slug-field.ts'

/**
 * Libellés thématiques du catalogue (slug Payload `libelles`). Transversaux
 * aux deux maisons — un livre peut en porter plusieurs. Remplacent les
 * anciennes collections éditoriales (`collections`, scopées par `edition`).
 */
export const BookLabels: CollectionConfig = {
  slug: 'libelles',
  labels: {
    singular: 'Libellé',
    plural: 'Libellés',
  },
  admin: {
    group: 'Catalogue',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
    description:
      'Thèmes majeurs du catalogue (introduction, travail, genre…). Un livre peut porter plusieurs libellés.',
  },
  access: {
    read: () => true,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    // Le nom d'un libellé apparaît sur les fiches et dans les facettes
    // catalogue — même levier de revalidation que les autres taxonomies.
    afterChange: [revalidateCatalogueTagAfterChange, revalidateCatalogueAfterChange],
    afterDelete: [revalidateCatalogueTagAfterDelete, revalidateCatalogueAfterDelete],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          label: 'Nom',
          admin: { width: '65%' },
        },
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          label: 'Slug',
          hooks: {
            beforeValidate: [deriveSlugFromLabel('name')],
          },
          admin: {
            width: '35%',
            description:
              'Identifiant d’URL (`?libelle=…`) — prérempli depuis le nom.',
            components: {
              Field: '/payload/admin/SlugFromLabelField.tsx#SlugFromLabelField',
            },
          },
        },
      ],
    },
  ],
}
