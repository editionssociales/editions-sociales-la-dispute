import type { CollectionConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import {
  revalidateRencontresAfterChange,
  revalidateRencontresAfterDelete,
} from '../hooks/revalidate.ts'

/**
 * Agenda public des rencontres, débats et présentations (page `/rencontres`)
 * — remplace `src/lib/rencontres-data.ts` (données provisoires saisies à la
 * main). Collection simple sur le modèle de `Highlight.ts` : pas de
 * versions/brouillons, lecture publique inconditionnelle, une seule page du
 * site à revalider.
 *
 * `image` prime sur la couverture du livre lié quand les deux sont
 * renseignées — résolution faite en lecture par `src/lib/rencontres.ts`,
 * jamais ici (cette collection ne fait que stocker les deux champs).
 */
export const Rencontres: CollectionConfig = {
  slug: 'rencontres',
  labels: {
    singular: 'Rencontre',
    plural: 'Rencontres',
  },
  defaultSort: '-date',
  admin: {
    group: 'Site',
    useAsTitle: 'titre',
    defaultColumns: ['titre', 'date', 'ville'],
    description: 'Agenda public des rencontres (page /rencontres) — une entrée par événement.',
    // Chips de filtre À venir/Passées/Toutes — au-dessus du tableau, même
    // slot et même pattern que `BooksFilterChipsPanel.tsx`/`Books.ts`.
    components: {
      beforeListTable: [
        '/payload/admin/rencontres/RencontresFilterChipsPanel.tsx#RencontresFilterChipsPanel',
      ],
    },
  },
  access: {
    // Agenda public, comme le bandeau `highlight` — aucune donnée sensible,
    // aucun statut brouillon à filtrer (pas de `versions` sur cette collection).
    read: () => true,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateRencontresAfterChange],
    afterDelete: [revalidateRencontresAfterDelete],
  },
  fields: [
    {
      name: 'titre',
      type: 'text',
      required: true,
      label: 'Titre',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'date',
          type: 'date',
          required: true,
          label: 'Date',
          admin: {
            width: '34%',
            date: {
              pickerAppearance: 'dayOnly',
              displayFormat: 'dd/MM/yyyy',
            },
          },
        },
        {
          name: 'heure',
          type: 'text',
          label: 'Heure',
          admin: {
            width: '33%',
            description: 'Texte libre, ex. « 15h-16h30 ».',
            placeholder: '15h-16h30',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'lieu',
          type: 'text',
          required: true,
          label: 'Lieu',
          admin: {
            width: '50%',
            placeholder: 'Librairie Ombres blanches',
          },
        },
        {
          name: 'ville',
          type: 'text',
          required: true,
          label: 'Ville',
          admin: {
            width: '50%',
            placeholder: 'Toulouse',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'livre',
          type: 'relationship',
          relationTo: 'books',
          label: 'Livre',
          admin: {
            width: '50%',
            description:
              'Livre présenté — sa couverture sert d’image de l’événement par défaut.',
          },
        },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          label: 'Image',
          displayPreview: true,
          filterOptions: {
            mimeType: { contains: 'image' },
          },
          admin: {
            width: '50%',
            description:
              'Photo ou visuel de l’événement (facultatif) — remplace la couverture du livre si renseigné. Format libre.',
          },
        },
      ],
    },
    {
      name: 'intervenants',
      type: 'text',
      label: 'Livre, auteurs, intervenants',
      admin: {
        description:
          'Texte libre — ex. « Gouverner les juges, Vincent Sizaire ; avec Marie Dosé et Fabrice Arfi ».',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
      label: 'Description',
    },
  ],
}
