import type { GlobalConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import { revalidateAProposAfterChange } from '../hooks/revalidate.ts'

/**
 * Page À propos éditable (spec « éditeur de contenus », lot 3) : textes du
 * héros, citation en exergue, surcharge des textes des deux maisons
 * (`EDITION_LIST`, `src/lib/editions.ts` — les couleurs d'accent restent en
 * code) et sections libres {titre, richText} qui remplacent la section
 * « Le catalogue ». Chaque champ vide retombe sur le texte actuel codé en
 * dur (`src/lib/site-content-core.ts`) — iso-rendu strict à global vide.
 *
 * Onglets UI sans `name` (même pattern que `PagesLegales` / fiche Livre) :
 * chemins de données inchangés.
 */
export const PageAPropos: GlobalConfig = {
  slug: 'page-a-propos',
  label: 'Page À propos',
  typescript: {
    // Sans quoi `generate:types` singulariserait le slug en « PageAPropo ».
    interface: 'PageAPropos',
  },
  admin: {
    group: 'Site',
    description:
      'Textes de la page /a-propos. Un champ vide = le texte actuel du site ; les couleurs et la mise en page restent en code.',
  },
  access: {
    read: () => true,
    update: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateAProposAfterChange],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Héros',
          fields: [
            {
              name: 'heros',
              type: 'group',
              label: 'Héros',
              fields: [
                {
                  name: 'titre',
                  type: 'text',
                  label: 'Titre',
                  admin: { description: 'Vide = titre actuel.' },
                },
                {
                  name: 'intro',
                  type: 'textarea',
                  label: 'Introduction',
                  admin: { description: 'Vide = texte actuel.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Citation',
          fields: [
            {
              name: 'citation',
              type: 'group',
              label: 'Citation en exergue',
              fields: [
                {
                  name: 'texte',
                  type: 'textarea',
                  label: 'Citation',
                  admin: { description: 'Guillemets compris. Vide = citation actuelle.' },
                },
                {
                  name: 'attribution',
                  type: 'text',
                  label: 'Attribution',
                  admin: { description: 'Vide = attribution actuelle.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Maisons',
          fields: [
            {
              name: 'maisons',
              type: 'array',
              label: 'Les deux maisons',
              maxRows: 2,
              labels: {
                singular: 'Maison',
                plural: 'Maisons',
              },
              admin: {
                description:
                  'Surcharge les textes de la section « Deux maisons ». Maison absente ou champ vide = texte actuel ; les couleurs restent en code.',
              },
              fields: [
                {
                  name: 'maison',
                  type: 'select',
                  required: true,
                  label: 'Maison',
                  options: [
                    { label: 'Les Éditions sociales', value: 'editions-sociales' },
                    { label: 'La Dispute', value: 'la-dispute' },
                  ],
                },
                {
                  name: 'nom',
                  type: 'text',
                  label: 'Nom affiché',
                },
                {
                  name: 'tagline',
                  type: 'text',
                  label: 'Sous-titre',
                },
                {
                  name: 'description',
                  type: 'textarea',
                  label: 'Description',
                },
              ],
            },
          ],
        },
        {
          label: 'Sections',
          fields: [
            {
              name: 'sections',
              type: 'array',
              label: 'Sections',
              labels: {
                singular: 'Section',
                plural: 'Sections',
              },
              admin: {
                description:
                  'Remplacent la section « Le catalogue » (titre, texte et boutons actuels). Aucune section = section actuelle.',
              },
              fields: [
                {
                  name: 'titre',
                  type: 'text',
                  required: true,
                  label: 'Titre',
                },
                {
                  name: 'contenu',
                  type: 'richText',
                  label: 'Contenu',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
