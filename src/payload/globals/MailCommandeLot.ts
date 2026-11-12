import type { GlobalConfig } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import { revalidateMailCommandeLotAfterChange } from '../hooks/revalidate.ts'

/**
 * Texte du mail envoyé aux commandes de lots (`Orders.venteParLot`, client
 * 2026-11) : remplace l'accroche standard du mail de confirmation (le
 * récapitulatif, les totaux et la note de livraison restent ceux du mail
 * habituel) et ajoute un bloc de recommandations de lecture. Champs vides =
 * défauts sobres codés en dur (`site-content-core.ts:mergeMailCommandeLot`).
 */
export const MailCommandeLot: GlobalConfig = {
  slug: 'mail-commande-lot',
  label: 'Mail commande par lot',
  typescript: {
    interface: 'MailCommandeLot',
  },
  admin: {
    group: 'Boutique',
    description: 'Texte du mail de confirmation des commandes de lots. Un champ vide = le texte par défaut.',
  },
  access: {
    read: isAdminOrEditor,
    update: isAdminOrEditor,
  },
  hooks: {
    afterChange: [revalidateMailCommandeLotAfterChange],
  },
  fields: [
    {
      name: 'objet',
      type: 'text',
      label: 'Objet du mail',
      admin: { description: 'Vide = objet habituel (« Confirmation de votre commande … »).' },
    },
    {
      name: 'message',
      type: 'textarea',
      label: 'Message',
      admin: {
        description:
          'Texte brut ; séparez les paragraphes par une ligne vide. Remplace la phrase d’accueil du mail. Vide = texte par défaut.',
      },
    },
    {
      name: 'recommandationsTitre',
      type: 'text',
      label: 'Titre du bloc de recommandations',
      defaultValue: 'Nos recommandations de lecture',
    },
    {
      name: 'recommandations',
      type: 'relationship',
      relationTo: 'books',
      hasMany: true,
      maxRows: 6,
      label: 'Livres recommandés',
      admin: { description: 'Six livres au plus. Une fiche non publiée est ignorée.' },
    },
  ],
}
