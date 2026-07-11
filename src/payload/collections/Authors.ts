import type { CollectionConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import {
  revalidateCatalogueAfterChange,
  revalidateCatalogueAfterDelete,
} from '../hooks/revalidate.ts'

export const Authors: CollectionConfig = {
  slug: 'authors',
  labels: {
    singular: 'Auteur·rice',
    plural: 'Auteur·rice·s',
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
    // Le nom/slug d'un·e auteur·rice apparaît sur toute fiche livre associée
    // (facette catalogue comprise) — même levier de revalidation qu'E6.
    afterChange: [revalidateCatalogueAfterChange],
    afterDelete: [revalidateCatalogueAfterDelete],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nom',
      admin: {
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
    },
    {
      name: 'bio',
      type: 'richText',
      label: 'Biographie',
    },
  ],
}
