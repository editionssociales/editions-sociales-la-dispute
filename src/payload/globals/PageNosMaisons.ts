import type { Block, Field, GlobalConfig } from 'payload'

import { safeHref, safeHttpUrl } from '../../lib/safe-url.ts'
import { NOS_MAISONS_TITRE_DEFAUT } from '../../lib/site-defaults.ts'
import { isAdminOrEditor } from '../access.ts'
import { revalidatePageNosMaisonsAfterChange } from '../hooks/revalidate.ts'

/**
 * Page /nos-maisons — ÉDITEUR DE SECTIONS LIBRE (client 2026-11) : la page est
 * une suite de sections que l'équipe ajoute, supprime, réordonne et nomme à
 * volonté, chacune d'un des types ci-dessous (blocs Payload). Le titre de la
 * page reste un champ à part. Page sans aucune section ⇒ les deux cartes
 * maisons seules (`site-content-core.ts:mergePageNosMaisons`, défaut dur).
 *
 * Titre de section (`titre`) : FACULTATIF partout — vide = aucun intertitre ;
 * saisi, il s'affiche en bandeau plein (cf. `nos-maisons/page.tsx`) ET sert
 * d'étiquette à la ligne dans l'éditeur (`SectionRowLabel`).
 *
 * Reprise de l'existant : la migration `20261113_120000_nos_maisons_sections`
 * convertit l'ancien contenu (texte, vidéos, articles, cartes maisons) en
 * sections ; les anciennes tables restent en base, inutilisées.
 */

/** Champs d'un lien externe (vidéo ou article) — `url` revalidée http(s) (même règle que la lecture, `safe-url.ts`). */
const lienFields = (urlDescription: string): Field[] => [
  { name: 'titre', type: 'text', label: 'Titre', required: true },
  {
    name: 'url',
    type: 'text',
    label: 'Adresse (URL)',
    required: true,
    validate: (value: string | null | undefined) =>
      safeHttpUrl(value) ? true : 'Adresse complète attendue, commençant par https:// (ou http://).',
    admin: { description: urlDescription },
  },
  { name: 'media', type: 'text', label: 'Média', admin: { description: 'Nom du média (ex. « France Inter »). Optionnel.' } },
  { name: 'date', type: 'text', label: 'Date', admin: { description: 'Texte libre (ex. « 12 octobre 2026 »). Optionnel.' } },
]

const titreSection: Field = {
  name: 'titre',
  type: 'text',
  label: 'Titre de la section',
  admin: {
    description: 'Facultatif — vide = aucun titre affiché. Sert aussi de nom à cette section dans l’éditeur.',
  },
}

const LABEL = '/payload/admin/SectionRowLabel.tsx#SectionRowLabel'
const blockAdmin = { components: { Label: LABEL }, disableBlockName: true } as const

const BLOCS: Block[] = [
  {
    slug: 'texte',
    labels: { singular: 'Texte', plural: 'Textes' },
    admin: blockAdmin,
    fields: [
      titreSection,
      {
        name: 'contenu',
        type: 'textarea',
        label: 'Texte',
        required: true,
        admin: { description: 'Texte brut ; séparez les paragraphes par une ligne vide.' },
      },
    ],
  },
  {
    slug: 'carrouselVideos',
    labels: { singular: 'Carrousel de vidéos', plural: 'Carrousels de vidéos' },
    admin: blockAdmin,
    fields: [
      titreSection,
      {
        name: 'videos',
        type: 'array',
        label: 'Vidéos',
        labels: { singular: 'Vidéo', plural: 'Vidéos' },
        minRows: 1,
        admin: { description: 'Dans cet ordre.' },
        fields: lienFields(
          'Lien YouTube (intégré dans la page). Tout autre lien http(s) s’affiche comme un lien vers la vidéo.',
        ),
      },
    ],
  },
  {
    slug: 'carrouselArticles',
    labels: { singular: 'Carrousel d’articles', plural: 'Carrousels d’articles' },
    admin: blockAdmin,
    fields: [
      titreSection,
      {
        name: 'articles',
        type: 'array',
        label: 'Articles',
        labels: { singular: 'Article', plural: 'Articles' },
        minRows: 1,
        admin: { description: 'Dans cet ordre.' },
        fields: [
          ...lienFields('Lien http(s) vers l’article.'),
          {
            name: 'image',
            type: 'upload',
            relationTo: 'media',
            label: 'Photo de l’article',
            displayPreview: true,
            filterOptions: { mimeType: { contains: 'image' } },
            admin: {
              description: 'Optionnelle — affichée au-dessus du titre, dans le carrousel.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'miseEnAvant',
    labels: { singular: 'Mise en avant', plural: 'Mises en avant' },
    admin: blockAdmin,
    fields: [
      {
        name: 'titre',
        type: 'text',
        label: 'Titre',
        required: true,
        admin: { description: 'Le grand titre de l’encadré. Sert aussi de nom à cette section dans l’éditeur.' },
      },
      { name: 'texte', type: 'textarea', label: 'Texte', admin: { description: 'Optionnel — texte brut, paragraphes séparés par une ligne vide.' } },
      {
        type: 'row',
        fields: [
          { name: 'lienLibelle', type: 'text', label: 'Libellé du bouton', admin: { width: '50%', description: 'Optionnel — sans libellé ni adresse, pas de bouton.' } },
          {
            name: 'lienUrl',
            type: 'text',
            label: 'Adresse du bouton',
            validate: (value: string | null | undefined) =>
              !value || safeHref(value) ? true : 'Adresse http(s) complète, ou chemin du site commençant par « / ».',
            admin: { width: '50%', description: 'https://… ou un chemin du site (ex. /souscription).' },
          },
        ],
      },
      {
        name: 'couleur',
        type: 'select',
        label: 'Couleur de fond',
        defaultValue: 'jaune',
        options: [
          { label: 'Jaune', value: 'jaune' },
          { label: 'Rose', value: 'rose' },
          { label: 'Bleu clair', value: 'bleu' },
          { label: 'Orange', value: 'orange' },
        ],
      },
    ],
  },
  {
    slug: 'citation',
    labels: { singular: 'Citation', plural: 'Citations' },
    admin: blockAdmin,
    fields: [
      { name: 'texte', type: 'textarea', label: 'Citation', required: true },
      {
        type: 'row',
        fields: [
          { name: 'auteur', type: 'text', label: 'Auteur·rice', admin: { width: '50%' } },
          { name: 'source', type: 'text', label: 'Source', admin: { width: '50%', description: 'Média, ouvrage, fonction… Optionnel.' } },
        ],
      },
    ],
  },
  {
    slug: 'maisons',
    labels: { singular: 'Les deux maisons', plural: 'Les deux maisons' },
    admin: blockAdmin,
    fields: [titreSection],
  },
]

export const PageNosMaisons: GlobalConfig = {
  slug: 'page-nos-maisons',
  label: 'Page Nos maisons',
  typescript: {
    interface: 'PageNosMaisons',
  },
  admin: {
    group: 'Pages du site',
    description:
      'Page /nos-maisons : ajoutez, supprimez et réordonnez librement des sections (texte, carrousel de vidéos, carrousel d’articles avec photo, mise en avant, citation, cartes des deux maisons).',
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
      label: 'Titre de la page',
      admin: { placeholder: NOS_MAISONS_TITRE_DEFAUT, description: 'Vide = « Nos maisons ».' },
    },
    {
      name: 'sections',
      type: 'blocks',
      label: 'Sections',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: BLOCS,
      admin: {
        initCollapsed: true,
        description:
          'Les sections s’affichent dans cet ordre. Sans aucune section, la page ne montre que les cartes des deux maisons.',
      },
    },
  ],
}
