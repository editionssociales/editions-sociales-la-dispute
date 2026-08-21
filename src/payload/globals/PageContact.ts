import type { GlobalConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import { revalidatePageContactAfterChange } from '../hooks/revalidate.ts'

/**
 * Page /contact éditable — titre et chapeau du `PageHero` uniquement (le
 * reste de la page, formulaire ou repli e-mail manuel selon
 * `brevoConfigured()`, n'a pas de texte éditorial : ce sont des microcopies
 * fonctionnelles, hors périmètre de l'éditeur de contenus). Champ vide =
 * texte actuel codé en dur (`src/lib/site-content-core.ts`) — iso-rendu
 * strict à global vide, même contrat que les autres globals « Site ».
 */
export const PageContact: GlobalConfig = {
  slug: 'page-contact',
  label: 'Page Contact',
  typescript: {
    interface: 'PageContact',
  },
  admin: {
    group: 'Site',
    description: 'Textes de la page /contact. Un champ vide = le texte actuel du site.',
  },
  access: {
    read: () => true,
    update: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidatePageContactAfterChange],
  },
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
      label: 'Texte d’introduction',
      admin: { description: 'Chapeau sous le titre. Vide = texte actuel.' },
    },
  ],
}
