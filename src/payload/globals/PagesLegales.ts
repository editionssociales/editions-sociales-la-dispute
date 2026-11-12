import { lexicalEditor } from '@payloadcms/richtext-lexical'
import type { GlobalConfig } from 'payload'

import {
  DELIVERY_DELAY_RANGE,
  FOOTER_ADRESSE_DEFAUT,
  SEO_DESCRIPTION_DEFAUT,
  SEO_TITRE_DEFAUT,
  livraisonInfosDefaut,
} from '../../lib/site-defaults.ts'
import { isAdminOrEditor } from '../access.ts'
import { revalidatePagesLegalesAfterChange } from '../hooks/revalidate.ts'

/**
 * Édition des pages / contenus transverses du site (ex-`pages-legales` +
 * ex-`reglages-site`) — un seul global à onglets : Pied de page / Réseaux /
 * Référencement / CGV & dons / Mentions / Confidentialité (petits réglages
 * d'abord, longs textes juridiques au fond). Pattern Highlight généralisé :
 * le front lit via la Local API (`src/lib/site-content.ts`) et retombe sur
 * les textes codés en dur tant qu'un champ est vide.
 */
export const PagesLegales: GlobalConfig = {
  slug: 'pages-legales',
  label: 'Mentions légales & pied de page',
  typescript: {
    // Sans quoi `generate:types` singulariserait le slug en « PagesLegale ».
    interface: 'PagesLegales',
  },
  admin: {
    group: 'Pages du site',
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
                    placeholder: FOOTER_ADRESSE_DEFAUT,
                    description:
                      'Sous « Les Éditions sociales × La Dispute » (le nom reste fixe). Vide = texte actuel.',
                  },
                },
                // Plus de champ « Texte de la cellule Diffusion-Distribution » :
                // la phrase est supprimée du pied de page (retour Clara
                // 2026-08-07) et le champ avec elle — le vider dans /admin
                // n'aurait rien enlevé (`mergeReglagesSite` retombe sur le
                // défaut dur à champ vide). Colonne larguée par la migration
                // `20260817_..._footer_sans_texte_diffusion`.
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
                    placeholder: SEO_TITRE_DEFAUT,
                    description:
                      'Titre de la page d’accueil et suffixe des titres de pages (« Page — Titre »). Vide = titre actuel.',
                  },
                },
                {
                  name: 'descriptionParDefaut',
                  type: 'textarea',
                  label: 'Description par défaut',
                  admin: {
                    placeholder: SEO_DESCRIPTION_DEFAUT,
                    description: 'Méta-description par défaut du site. Vide = description actuelle.',
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'CGV & dons',
          fields: [
            {
              name: 'livraisonDelai',
              type: 'text',
              label: 'Délai de livraison annoncé',
              admin: {
                placeholder: DELIVERY_DELAY_RANGE,
                description:
                  'Affiché sur la fiche produit, le panier, la page de remerciement et la section « Livraison » des CGV (« Livraison … »). ' +
                  'L’e-mail de confirmation garde toujours le texte par défaut.',
              },
            },
            {
              name: 'livraisonInfos',
              type: 'textarea',
              label: 'Informations de livraison (CGV)',
              admin: {
                placeholder: livraisonInfosDefaut(),
                description:
                  'Réécrit le paragraphe de la section « Livraison » des conditions de vente (zones, frais de port, délai, précommandes). ' +
                  'Séparez les paragraphes par une ligne vide. Vide = le texte affiché en transparence. ' +
                  'Sans effet si le champ « Conditions générales & conditions de don » ci-dessous est rempli (il remplace alors toute la page).',
              },
            },
            {
              name: 'cgv',
              type: 'richText',
              label: 'Conditions générales & conditions de don',
              editor: lexicalEditor({ admin: { placeholder: 'Texte actuel de la page /cgv affiché tant que ce champ est vide — écrivez ici pour le remplacer en entier.' } }),
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
              editor: lexicalEditor({ admin: { placeholder: 'Texte actuel de la page /mentions-legales affiché tant que ce champ est vide — écrivez ici pour le remplacer en entier.' } }),
              admin: {
                description:
                  'Remplace tout le corps de la page /mentions-legales (chapeau compris). Vide = texte actuel du site (identité légale de l’éditeur).',
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
              editor: lexicalEditor({ admin: { placeholder: 'Texte actuel de la page /confidentialite affiché tant que ce champ est vide — écrivez ici pour le remplacer en entier.' } }),
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
