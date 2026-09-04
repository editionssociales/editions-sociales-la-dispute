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
    group: 'Vie du site',
    useAsTitle: 'titre',
    // « Live » (calculée, cf. le champ `live` plus bas) remplace `actif` brut
    // en tête — dit si la bannière serait affichée AUJOURD'HUI, pas
    // seulement si la case est cochée (l'audit UX demandait ce croisement).
    defaultColumns: ['titre', 'live', 'dateDebut', 'dateFin', 'actif'],
  },
  access: {
    // Lu par la page d'accueil via la Local API ; même lecture ouverte que
    // les autres collections/globals du groupe Vie du site — aucune donnée
    // sensible. Écriture réservée aux mêmes rôles que le reste.
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
      // Champ `ui` purement présentationnel — colonne de liste calculée
      // uniquement, aucun effet sur le schéma de données. Invisible en fiche
      // (pas de composant `Field`), rendu en liste par `HighlightLiveCell`
      // (`src/payload/admin/cells/`).
      type: 'ui',
      name: 'live',
      label: 'Live',
      admin: {
        components: {
          Cell: '/payload/admin/cells/HighlightLiveCell.tsx#HighlightLiveCell',
        },
      },
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
        description: 'Couleur d’accent à gauche du bandeau. Sans effet si le lien pointe vers /souscription.',
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
        position: 'sidebar',
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
        position: 'sidebar',
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
