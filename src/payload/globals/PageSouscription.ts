import type { GlobalConfig } from 'payload'

import { DONATION_TIERS } from '../../lib/donation-tiers.ts'
import { isAdminOrEditor } from '../access.ts'
import { revalidateSouscriptionAfterChange } from '../hooks/revalidate.ts'

/**
 * Page Souscription éditable (spec « éditeur de contenus », lot 4) : textes
 * du héros et arrays chantiers / contreparties / mécènes / FAQ. Séparation
 * stricte présentation / mécanique de paiement : les contreparties et
 * mécènes référencent un palier de `DONATION_TIERS`
 * (`src/lib/donation-tiers.ts`) par un select dont les options sont
 * dérivées de la table importée — montant et intitulé encaissés viennent
 * TOUJOURS de la table (c'est elle qui pilote Stripe via `parseDonation`),
 * seuls le détail des lots, les compteurs 2024 et les textes sont éditables.
 * Chaque bloc vide retombe sur le contenu actuel codé en dur
 * (`src/lib/site-content-core.ts`) — iso-rendu strict à global vide.
 */

const CONTREPARTIE_OPTIONS = DONATION_TIERS.filter((tier) => tier.physical).map((tier) => ({
  label: `${tier.amount} € — ${tier.title}`,
  value: tier.id,
}))

const MECENE_OPTIONS = DONATION_TIERS.filter((tier) => !tier.physical).map((tier) => ({
  label: `${tier.amount} € — ${tier.title}`,
  value: tier.id,
}))

export const PageSouscription: GlobalConfig = {
  slug: 'page-souscription',
  label: 'Page Souscription',
  typescript: {
    interface: 'PageSouscription',
  },
  admin: {
    group: 'Site',
    description:
      'Textes de la page /souscription. Un bloc vide = le contenu actuel du site ; les montants des paliers restent pilotés par le code (paiement Stripe).',
  },
  access: {
    read: () => true,
    update: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateSouscriptionAfterChange],
  },
  fields: [
    {
      name: 'heros',
      type: 'group',
      label: 'Héros (« En 2024, vous avez sauvé nos maisons »)',
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
    {
      name: 'chantiers',
      type: 'array',
      label: 'Chantiers (« Où va votre argent »)',
      labels: {
        singular: 'Chantier',
        plural: 'Chantiers',
      },
      admin: {
        description:
          'Aucun chantier = les cinq chantiers actuels. Les couleurs suivent l’ordre des cartes (en code).',
      },
      fields: [
        {
          name: 'titre',
          type: 'text',
          required: true,
          label: 'Titre',
        },
        {
          name: 'desc',
          type: 'textarea',
          required: true,
          label: 'Description',
        },
      ],
    },
    {
      name: 'contreparties',
      type: 'array',
      label: 'Contreparties',
      labels: {
        singular: 'Contrepartie',
        plural: 'Contreparties',
      },
      admin: {
        description:
          'Aucune contrepartie = les huit cartes actuelles. Montant et intitulé viennent du palier choisi — ils pilotent le paiement et ne s’éditent pas ici.',
      },
      fields: [
        {
          name: 'tierId',
          type: 'select',
          required: true,
          label: 'Palier',
          options: CONTREPARTIE_OPTIONS,
        },
        {
          name: 'items',
          type: 'array',
          label: 'Contenu du lot',
          labels: {
            singular: 'Élément',
            plural: 'Éléments',
          },
          fields: [
            {
              name: 'texte',
              type: 'text',
              required: true,
              label: 'Texte',
            },
          ],
        },
        {
          name: 'soutiens2024',
          type: 'number',
          required: true,
          min: 0,
          label: 'Soutiens en 2024',
          admin: { description: 'Compteur « N soutiens en 2024 » affiché sous la carte.' },
        },
        {
          name: 'populaire',
          type: 'checkbox',
          defaultValue: false,
          label: 'Badge « Le plus choisi en 2024 »',
        },
      ],
    },
    {
      name: 'mecenes',
      type: 'array',
      label: 'Grands paliers (mécènes)',
      labels: {
        singular: 'Mécène',
        plural: 'Mécènes',
      },
      admin: {
        description:
          'Aucune entrée = les deux cartes actuelles (500 € / 1 000 €). Même règle : le montant vient du palier choisi.',
      },
      fields: [
        {
          name: 'tierId',
          type: 'select',
          required: true,
          label: 'Palier',
          options: MECENE_OPTIONS,
        },
        {
          name: 'desc',
          type: 'textarea',
          required: true,
          label: 'Description',
        },
        {
          name: 'soutiens2024',
          type: 'number',
          required: true,
          min: 0,
          label: 'Soutiens en 2024',
        },
      ],
    },
    {
      name: 'faq',
      type: 'array',
      label: 'Questions fréquentes',
      labels: {
        singular: 'Question',
        plural: 'Questions',
      },
      admin: {
        description: 'Aucune question = les quatre questions actuelles.',
      },
      fields: [
        {
          name: 'question',
          type: 'text',
          required: true,
          label: 'Question',
        },
        {
          name: 'reponse',
          type: 'textarea',
          required: true,
          label: 'Réponse',
        },
      ],
    },
  ],
}
