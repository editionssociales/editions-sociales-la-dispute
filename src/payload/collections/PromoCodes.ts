import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '../access.ts'
import { normalizePromoCode } from '../../lib/promo-core.ts'

/** Normalise le code saisi (majuscules, espaces de bord) avant validation d'unicité. */
const normalizeCode: CollectionBeforeValidateHook = ({ data }) => {
  if (typeof data?.code === 'string') {
    return { ...data, code: normalizePromoCode(data.code) }
  }
  return data
}

/**
 * Codes promo V1 (décalque du coupon Woo natif — plan phase 4 §3/§Calage) :
 * seuls les deux types réellement utilisés en base sont couverts,
 * `fixed_cart` (montant fixe retranché du panier) et `free_shipping`
 * (livraison offerte, généralement combinée à un `minCart`). Gérés à la main
 * par l'équipe dans le back-office — aucun n'est repris automatiquement de
 * Woo (question ouverte n°4, défaut retenu).
 */
export const PromoCodes: CollectionConfig = {
  slug: 'promo-codes',
  labels: {
    singular: 'Code promo',
    plural: 'Codes promo',
  },
  admin: {
    group: 'Boutique',
    useAsTitle: 'code',
    // « État » (calculée) remplace la colonne `active` brute — audit UX,
    // manque n°1 : aucune colonne ne disait « en cours en ce moment »
    // (croise active + expiresAt, cf. le champ `etat` plus bas).
    defaultColumns: ['code', 'etat', 'type', 'amount', 'expiresAt'],
  },
  // Remonte les codes actifs récemment édités en tête de liste — pas de
  // meilleur candidat (pas de champ « dernière utilisation »).
  defaultSort: '-updatedAt',
  access: {
    // Pas de lecture publique : un code promo listé via l'API serait
    // énumérable. Le futur endpoint de checkout le valide côté serveur via
    // la Local API (overrideAccess), pas via une lecture REST publique.
    read: isAdminOrEditor,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [normalizeCode],
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      label: 'Code',
      admin: {
        description: 'Normalisé en majuscules à la sauvegarde (insensible à la casse au checkout).',
      },
    },
    {
      // Champ `ui` purement présentationnel — colonne de liste calculée
      // uniquement, aucun effet sur le schéma de données. Invisible en fiche
      // (pas de composant `Field`), rendu en liste par `PromoStatusCell`
      // (`src/payload/admin/cells/`), qui croise `active`/`expiresAt` via
      // `isPromoExpired` (`src/lib/promo-core.ts`).
      type: 'ui',
      name: 'etat',
      label: 'État',
      admin: {
        components: {
          Cell: '/payload/admin/cells/PromoStatusCell.tsx#PromoStatusCell',
        },
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'fixed_cart',
      label: 'Type',
      options: [
        { value: 'fixed_cart', label: 'Montant fixe sur le panier' },
        { value: 'free_shipping', label: 'Livraison offerte' },
      ],
    },
    {
      name: 'amount',
      type: 'number',
      min: 0,
      label: 'Montant (€)',
      admin: {
        description: 'Utilisé uniquement pour le type « montant fixe » — ignoré pour « livraison offerte ».',
        condition: (data) => data?.type === 'fixed_cart',
      },
    },
    {
      name: 'minCart',
      type: 'number',
      min: 0,
      label: 'Panier minimum (€)',
      admin: {
        description: 'Montant TTC minimum du panier pour que le code s’applique (ex. 50 € pour la livraison offerte).',
      },
    },
    {
      name: 'expiresAt',
      type: 'date',
      label: 'Expire le',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayOnly',
          displayFormat: 'dd/MM/yyyy',
        },
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Actif',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
