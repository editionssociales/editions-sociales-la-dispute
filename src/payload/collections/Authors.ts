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

export const Authors: CollectionConfig = {
  slug: 'authors',
  labels: {
    singular: 'Auteur·rice',
    plural: 'Auteur·rice·s',
  },
  admin: {
    group: 'Catalogue',
    useAsTitle: 'name',
    description:
      'Fiches auteur·rice·s rattachées aux livres (nom, biographie) — à créer avant de pouvoir les associer à une fiche Livre.',
  },
  access: {
    read: () => true,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    // Le nom/slug d'un·e auteur·rice apparaît sur toute fiche livre associée
    // (facette catalogue comprise) — même levier de revalidation qu'E6.
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
          admin: {
            width: '65%',
            description: 'Forme « Prénom Nom »',
          },
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
            description: 'Prérempli depuis le nom — ne pas modifier après publication',
            components: {
              Field: '/payload/admin/SlugFromLabelField.tsx#SlugFromLabelField',
            },
          },
        },
      ],
    },
    {
      name: 'bio',
      type: 'richText',
      label: 'Biographie',
    },
  ],
}
