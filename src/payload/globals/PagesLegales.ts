import type { GlobalConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import { revalidatePagesLegalesAfterChange } from '../hooks/revalidate.ts'

/**
 * Édition des pages / contenus transverses du site (ex-`pages-legales` +
 * ex-`reglages-site`) — un seul global à onglets : CGV & dons / Mentions /
 * Confidentialité / Pied de page / Réseaux / Référencement. Pattern Highlight
 * généralisé : le front lit via la Local API (`src/lib/site-content.ts`) et
 * retombe sur les textes codés en dur tant qu'un champ est vide.
 */
export const PagesLegales: GlobalConfig = {
  slug: 'pages-legales',
  label: 'Pages',
  typescript: {
    // Sans quoi `generate:types` singulariserait le slug en « PagesLegale ».
    interface: 'PagesLegales',
  },
  admin: {
    group: 'Site',
    description:
      'Pages légales, pied de page, réseaux sociaux et référencement. Un champ vide = texte actuel du site.',
  },
  access: {
    read: () => true,
    update: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidatePagesLegalesAfterChange],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'CGV & dons',
          fields: [
            {
              name: 'cgv',
              type: 'richText',
              label: 'Conditions générales & conditions de don',
              admin: {
                description:
                  'Remplace tout le corps de la page /cgv (chapeau compris) — le titre et le fil d’ariane restent fixes. Vide = texte actuel du site.',
              },
            },
          ],
        },
        {
          label: 'Mentions légales',
          fields: [
            {
              name: 'mentionsLegales',
              type: 'richText',
              label: 'Mentions légales',
              admin: {
                description:
                  'Remplace tout le corps de la page /mentions-legales (chapeau compris). Vide = texte actuel du site, avec ses placeholders [À COMPLÉTER…].',
              },
            },
          ],
        },
        {
          label: 'Confidentialité',
          fields: [
            {
              name: 'confidentialite',
              type: 'richText',
              label: 'Politique de confidentialité',
              admin: {
                description:
                  'Remplace tout le corps de la page /confidentialite (chapeau compris). Vide = texte actuel du site.',
              },
            },
          ],
        },
        {
          label: 'Pied de page',
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
          ],
        },
        {
          label: 'Réseaux sociaux',
          fields: [
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
          ],
        },
        {
          label: 'Référencement',
          fields: [
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
        },
      ],
    },
  ],
}
