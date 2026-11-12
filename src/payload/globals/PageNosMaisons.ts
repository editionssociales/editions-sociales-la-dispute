import type { Field, GlobalConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import { revalidatePageNosMaisonsAfterChange } from '../hooks/revalidate.ts'

/**
 * Lien externe de la page (vidéo ou article) : même forme des deux côtés, seul
 * le rendu diffère (`/nos-maisons`). L'URL est revalidée (http/https) à la
 * lecture (`site-content-core.ts:safeHttpUrl`) — le champ n'est qu'un texte.
 */
const lienFields = (urlDescription: string): Field[] => [
  { name: 'titre', type: 'text', label: 'Titre', required: true },
  { name: 'url', type: 'text', label: 'Adresse (URL)', required: true, admin: { description: urlDescription } },
  { name: 'media', type: 'text', label: 'Média', admin: { description: 'Nom du média (ex. « France Inter »). Optionnel.' } },
  { name: 'date', type: 'text', label: 'Date', admin: { description: 'Texte libre (ex. « 12 octobre 2026 »). Optionnel.' } },
]

/**
 * Page /nos-maisons éditable (auto-promo : texte, carrousel de vidéos,
 * articles). Une section vide n'est pas rendue ; les deux cartes maisons
 * viennent de `NAV_HOUSES`, pas d'ici. Même contrat que `PageContact`.
 */
export const PageNosMaisons: GlobalConfig = {
  slug: 'page-nos-maisons',
  label: 'Page Nos maisons',
  typescript: {
    interface: 'PageNosMaisons',
  },
  admin: {
    group: 'Pages du site',
    description:
      'Page /nos-maisons : texte, vidéos (interventions dans les médias) et articles. Une section vide n’est pas affichée.',
  },
  access: {
    read: () => true,
    update: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidatePageNosMaisonsAfterChange],
  },
  fields: [
    {
      name: 'titre',
      type: 'text',
      label: 'Titre',
      admin: { description: 'Vide = « Nos maisons ».' },
    },
    {
      name: 'texte',
      type: 'textarea',
      label: 'Texte',
      admin: {
        description: 'Texte brut ; séparez les paragraphes par une ligne vide. Vide = pas de texte.',
      },
    },
    {
      name: 'videos',
      type: 'array',
      label: 'Vidéos',
      labels: { singular: 'Vidéo', plural: 'Vidéos' },
      admin: { description: 'Carrousel, dans cet ordre.' },
      fields: lienFields(
        'Lien YouTube (intégré dans la page). Tout autre lien http(s) s’affiche comme un lien vers la vidéo.',
      ),
    },
    {
      name: 'articles',
      type: 'array',
      label: 'Articles',
      labels: { singular: 'Article', plural: 'Articles' },
      fields: lienFields('Lien http(s) vers l’article.'),
    },
  ],
}
