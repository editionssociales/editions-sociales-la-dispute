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
 *
 * `couleur` (4 pop du site, texte noir par-dessus) et `lienLibelle` pilotent
 * le rendu du bandeau — l'ex-bandeau souscription codé en dur de la home est
 * depuis devenu une entrée de cette collection (semée par la migration
 * `highlight_couleur_cta`), soumise comme les autres à « une campagne à la
 * fois ».
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
      name: 'couleur',
      type: 'select',
      label: 'Couleur',
      defaultValue: 'pop-pink',
      options: [
        { value: 'pop-pink', label: 'Rose' },
        { value: 'pop-teal', label: 'Turquoise' },
        { value: 'pop-orange', label: 'Orange' },
        { value: 'pop-yellow', label: 'Jaune' },
      ],
      admin: {
        description: 'Couleur de fond du bandeau (le texte reste noir par-dessus).',
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
      name: 'lienLibelle',
      type: 'text',
      label: 'Libellé du lien',
      defaultValue: 'En savoir plus',
      admin: {
        description: 'Texte du bouton — utilisé seulement si un lien est renseigné.',
        condition: (data) => Boolean(data?.lien),
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
