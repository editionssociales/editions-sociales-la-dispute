import type { GlobalConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import { revalidateSiteLayoutAfterChange } from '../hooks/revalidate.ts'

/**
 * Réglages transverses du site public (spec « éditeur de contenus », lot 2) :
 * textes du pied de page, liens réseaux sociaux (footer uniquement — le
 * header, composant client d'animation au scroll, garde sa structure en
 * code, décision documentée) et metadata par défaut (title/description).
 * Chaque champ vide retombe sur le texte actuel codé en dur
 * (`src/lib/site-content-core.ts`) — iso-rendu strict tant que rien n'est
 * saisi. Distinct de `reglages-boutique` (réglage interne du commerce natif,
 * hors groupe « Contenus du site »).
 */
export const ReglagesSite: GlobalConfig = {
  slug: 'reglages-site',
  label: 'Réglages du site',
  typescript: {
    interface: 'ReglagesSite',
  },
  admin: {
    group: 'Contenus du site',
    description:
      'Pied de page, réseaux sociaux et référencement par défaut. Un champ vide = le texte actuel du site.',
  },
  access: {
    read: () => true,
    update: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateSiteLayoutAfterChange],
  },
  fields: [
    {
      name: 'footer',
      type: 'group',
      label: 'Pied de page',
      fields: [
        {
          name: 'adresse',
          type: 'textarea',
          label: 'Texte de la cellule « Adresse »',
          admin: {
            description:
              'Sous « Les Éditions sociales × La Dispute » (le nom reste fixe). Vide = texte actuel.',
          },
        },
        {
          name: 'texteDiffusion',
          type: 'textarea',
          label: 'Texte de la cellule « Diffusion-Distribution »',
          admin: {
            description: 'Vide = texte actuel.',
          },
        },
      ],
    },
    {
      name: 'reseauxSociaux',
      type: 'array',
      label: 'Réseaux sociaux',
      labels: {
        singular: 'Lien',
        plural: 'Liens',
      },
      admin: {
        description:
          'Affichés dans le pied de page (cellule « Suivez-nous »). Aucun lien = pied de page inchangé.',
      },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
          label: 'Libellé',
        },
        {
          name: 'url',
          type: 'text',
          required: true,
          label: 'URL',
          admin: {
            description: 'URL complète (https://…).',
          },
        },
      ],
    },
    {
      name: 'seo',
      type: 'group',
      label: 'Référencement',
      fields: [
        {
          name: 'titreParDefaut',
          type: 'text',
          label: 'Titre par défaut',
          admin: {
            description:
              'Titre de la page d’accueil et suffixe des titres de pages (« Page — Titre »). Vide = titre actuel.',
          },
        },
        {
          name: 'descriptionParDefaut',
          type: 'textarea',
          label: 'Description par défaut',
          admin: {
            description: 'Méta-description par défaut du site. Vide = description actuelle.',
          },
        },
      ],
    },
  ],
}
