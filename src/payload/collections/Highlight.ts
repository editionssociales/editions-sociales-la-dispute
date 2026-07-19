import type { CollectionConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import { revalidateHomeAfterChange, revalidateHomeAfterDelete } from '../hooks/revalidate.ts'

/**
 * Mise en avant ponctuelle (E6bis du plan, engagement **C32** du devis —
 * « mises en avant ponctuelles », remplace les 2 Popup Builder WordPress).
 * Rendue en bandeau sur la page d'accueil (`src/app/(site)/page.tsx`),
 * uniquement quand `actif` est coché **et** que la date courante tombe dans
 * `[dateDebut, dateFin]` — sinon la page reste strictement iso-rendu (aucun
 * wrapper ajouté, cf. la page d'accueil).
 */
export const Highlight: CollectionConfig = {
  slug: 'highlight',
  labels: {
    singular: 'Mise en avant',
    plural: 'Mises en avant',
  },
  admin: {
    group: 'Catalogue',
    useAsTitle: 'titre',
    defaultColumns: ['titre', 'actif', 'dateDebut', 'dateFin'],
    description: 'Bandeau ponctuel affiché sur la page d’accueil (une campagne à la fois).',
  },
  access: {
    // Lu par la page d'accueil via la Local API ; même lecture ouverte que
    // les autres collections éditoriales (Authors, BookCollections) — aucune
    // donnée sensible. Écriture réservée aux mêmes rôles que le reste.
    read: () => true,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateHomeAfterChange],
    afterDelete: [revalidateHomeAfterDelete],
  },
  fields: [
    {
      name: 'titre',
      type: 'text',
      required: true,
      label: 'Titre',
    },
    {
      name: 'texte',
      type: 'textarea',
      label: 'Texte court',
      admin: {
        description: 'Une ou deux phrases — pas de mise en forme (bandeau, pas une fiche).',
      },
    },
    {
      name: 'lien',
      type: 'text',
      label: 'Lien',
      admin: {
        description: 'URL absolue ou chemin du site (ex. /souscription) — facultatif.',
      },
    },
    {
      name: 'dateDebut',
      type: 'date',
      required: true,
      label: 'Date de début',
      admin: {
        date: {
          pickerAppearance: 'dayOnly',
          displayFormat: 'dd/MM/yyyy',
        },
      },
    },
    {
      name: 'dateFin',
      type: 'date',
      required: true,
      label: 'Date de fin',
      admin: {
        date: {
          pickerAppearance: 'dayOnly',
          displayFormat: 'dd/MM/yyyy',
        },
      },
    },
    {
      name: 'actif',
      type: 'checkbox',
      defaultValue: false,
      label: 'Actif',
      admin: {
        description:
          'Doit être coché ET la date courante comprise dans la période pour être visible.',
        position: 'sidebar',
      },
    },
  ],
}
