import type { GlobalConfig } from 'payload'

import { DONATION_TIERS } from '../../lib/donation-tiers.ts'
import { isAdminOrEditor } from '../access.ts'
import { revalidateSouscriptionAfterChange } from '../hooks/revalidate.ts'

/**
 * Page Souscription éditable — livraison définitive de la campagne 2026
 * (docx/xlsx/PDF client du 2026-07-24) : seul le bloc `contreparties` reste
 * dans /admin. Le récit (ask, sections, objectifs, CTA final) est éditorial
 * figé dans `souscription/page.tsx` — consigne client « rien qui ne soit un
 * extrait des documents fournis », rien à éditer côté back-office pour ces
 * textes-là. Séparation stricte présentation / mécanique de paiement : les
 * contreparties référencent un palier de `DONATION_TIERS`
 * (`src/lib/donation-tiers.ts`) par un select dont les options sont dérivées
 * de la table importée — montant et intitulé encaissés viennent TOUJOURS de
 * la table (c'est elle qui pilote Stripe via `parseDonation`), seul le
 * détail des lots est éditable. Bloc vide retombe sur le contenu actuel codé
 * en dur (`src/lib/site-content-core.ts`) — iso-rendu strict à global vide.
 */

const CONTREPARTIE_OPTIONS = DONATION_TIERS.map((tier) => ({
  label: `${tier.amount.toLocaleString("fr-FR")} € — ${tier.title}`,
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
      'Contreparties de la page /souscription. Un bloc vide = le contenu actuel du site ; les montants des paliers restent pilotés par le code (paiement Stripe).',
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
      name: 'contreparties',
      type: 'array',
      label: 'Contreparties',
      labels: {
        singular: 'Contrepartie',
        plural: 'Contreparties',
      },
      admin: {
        description:
          'Aucune contrepartie = les neuf cartes actuelles. Montant et intitulé viennent du palier choisi — ils pilotent le paiement et ne s’éditent pas ici.',
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
          admin: {
            description:
              'Une ligne par élément. Une ligne commençant par « ou » devient une alternative à la précédente (affichée « ou … », sans séparateur « + »).',
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
      ],
    },
  ],
}
