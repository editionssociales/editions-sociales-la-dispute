import type { GlobalConfig } from 'payload'

import {
  MAIL_LOT_MESSAGE_DEFAUT,
  MAIL_LOT_OBJET_EXEMPLE,
  MAIL_LOT_RECOMMANDATIONS_TITRE_DEFAUT,
} from '../../lib/site-defaults.ts'
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
      admin: {
        placeholder: MAIL_LOT_OBJET_EXEMPLE,
        description: 'Vide = objet habituel (« Confirmation de votre commande CMD-… », numéro réel).',
      },
    },
    {
      name: 'message',
      type: 'textarea',
      label: 'Message',
      admin: {
        placeholder: MAIL_LOT_MESSAGE_DEFAUT,
        description:
          'Texte brut ; séparez les paragraphes par une ligne vide. Remplace la phrase d’accueil du mail. Vide = texte par défaut.',
      },
    },
    {
      name: 'recommandationsTitre',
      type: 'text',
      label: 'Titre du bloc de recommandations',
      // Plus de `defaultValue` : une valeur pré-remplie ne se distingue pas d'un
      // texte saisi. Le défaut s'affiche en transparence, la fusion
      // (`mergeMailCommandeLot`) y retombe à champ vide.
      admin: { placeholder: MAIL_LOT_RECOMMANDATIONS_TITRE_DEFAUT },
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
