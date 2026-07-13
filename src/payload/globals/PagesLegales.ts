import type { GlobalConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import { revalidatePagesLegalesAfterChange } from '../hooks/revalidate.ts'

/**
 * Pages légales éditables (spec « éditeur de contenus », lot 1) — un seul
 * global à onglets : CGV & dons / Mentions légales / Confidentialité, un
 * champ richText par onglet. Pattern Highlight généralisé : le front lit via
 * la Local API (`src/lib/site-content.ts`) et retombe **intégralement** sur
 * le JSX actuel codé en dur tant qu'un onglet est vide — les placeholders
 * `[À COMPLÉTER : …]` restent donc les valeurs par défaut visibles, aucun
 * seed n'est fait dans Payload.
 */
export const PagesLegales: GlobalConfig = {
  slug: 'pages-legales',
  label: 'Pages légales',
  typescript: {
    // Sans quoi `generate:types` singulariserait le slug en « PagesLegale ».
    interface: 'PagesLegales',
  },
  admin: {
    group: 'Contenus du site',
    description:
      'Texte des trois pages légales. Un onglet vide laisse la page servie avec son texte par défaut (placeholders [À COMPLÉTER…] inclus).',
  },
  access: {
    // Contenu public, même posture que Highlight : lecture ouverte,
    // écriture réservée aux rôles éditoriaux.
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
      ],
    },
  ],
}
