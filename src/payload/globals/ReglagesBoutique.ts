import type { GlobalConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '../access.ts'

/**
 * Réglages transverses du commerce natif (plan phase 4, §3) — un seul
 * document, pas d'historique de versions nécessaire pour un seuil.
 */
export const ReglagesBoutique: GlobalConfig = {
  slug: 'reglages-boutique',
  label: 'Réglages boutique',
  access: {
    read: isAdminOrEditor,
    update: isAdmin,
  },
  fields: [
    {
      name: 'seuilAlerteStockBas',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 3,
      label: 'Seuil d’alerte stock bas',
      admin: {
        description:
          "En dessous de ce nombre d'exemplaires (`commerce.stock` des " +
          'fiches Livres), un article est signalé comme stock bas — usage ' +
          'réservé aux étapes ultérieures du plan (back-office, étape 10) ; ' +
          'ce lot ne pose que le réglage.',
      },
    },
  ],
}
