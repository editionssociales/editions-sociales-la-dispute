import type { CollectionConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'

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
