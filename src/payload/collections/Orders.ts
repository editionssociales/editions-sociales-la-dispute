import type { CollectionAfterChangeHook, CollectionConfig, Field } from 'payload'

import type { ShippingMethodLabel } from '../../lib/cart-quote.ts'
import { isAdmin, isAdminOrEditor } from '../access.ts'
import {
  exportComptaHandler,
  exportPreparationHandler,
} from '../lib/order-export-handler.ts'
import { formatOrderNumber } from '../lib/order-number.ts'

/**
 * Adresse de livraison/facturation — factory pour ne pas partager une même
 * référence de tableau de champs entre les deux groupes (Payload sanitise
 * chaque config de champ ; des objets partagés entre deux emplacements du
 * schéma sont un piège documenté du SDK).
 */
function addressFields(): Field[] {
  return [
    {
      name: 'fullName',
      type: 'text',
      required: true,
      label: 'Nom complet',
    },
    {
      name: 'addressLine1',
      type: 'text',
      required: true,
      label: 'Adresse',
    },
    {
      name: 'addressLine2',
      type: 'text',
      label: "Complément d'adresse",
    },
    {
      name: 'postalCode',
      type: 'text',
      required: true,
      label: 'Code postal',
    },
    {
      name: 'city',
      type: 'text',
      required: true,
      label: 'Ville',
    },
    {
      name: 'country',
      type: 'select',
      required: true,
      label: 'Pays',
      defaultValue: 'FR',
      options: [
        { value: 'FR', label: 'France' },
        { value: 'BE', label: 'Belgique' },
        { value: 'CH', label: 'Suisse' },
      ],
      admin: {
        description: 'Ventes restreintes FR/BE/CH (plan phase 4, étape 8).',
      },
    },
  ]
}

/** Aucune écriture de champ hors création — verrouillage documenté ci-dessous. */
const lockedAfterCreate = { update: () => false }

/**
 * Attribue le numéro de commande lisible juste après la création, une fois
 * l'`id` Postgres connu (serial, donc déjà unique et thread-safe — pas de
 * séquence dédiée à gérer). Le second `update` déclenché ici repasse par ce
 * même hook en `operation: 'update'` : la garde en tête l'empêche de boucler.
 */
const assignOrderNumber: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || doc.number) {
    return doc
  }
  const number = formatOrderNumber(doc.id as number)
  await req.payload.update({
    collection: 'orders',
    id: doc.id,
    data: { number },
    req,
    context: req.context,
  })
  return { ...doc, number }
}

/**
 * Commandes en invité (pas d'espace client, décision assumée — plan phase 4
 * §Objectif point 7). Écrite **uniquement** par le webhook Stripe (étape 9 du
 * plan), via la Local API avec `overrideAccess: true` — `create` est fermé
 * ici à toute autre voie (REST/GraphQL/back-office). Le back-office ne
 * modifie ensuite que `status` (suivi de préparation) : tous les autres
 * champs sont verrouillés en écriture après création (`lockedAfterCreate`).
 */
export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: {
    singular: 'Commande',
    plural: 'Commandes',
  },
  admin: {
    group: 'Quotidien',
    useAsTitle: 'number',
    defaultColumns: ['number', 'orderType', 'status', 'email', 'totalTTC', 'createdAt'],
    description:
      'Commandes du commerce natif — créées par le webhook Stripe, suivies ' +
      'ici (statut de préparation/expédition uniquement). Un panier mixte ' +
      '(articles parus + précommande) scinde en DEUX commandes distinctes ' +
      '(même session Stripe, même paiement) — cf. « Type ».',
    // Export CSV (mission « exports compta + livraison de la PR », plan §4
    // étape 10) — panneau au-dessus du tableau, cf. `OrderExportPanel.tsx`.
    components: {
      beforeListTable: ['/payload/admin/OrderExportPanel.tsx#OrderExportPanel'],
    },
  },
  access: {
    read: isAdminOrEditor,
    // Aucune création via l'API publique/l'admin : seul le webhook (Local
    // API, `overrideAccess: true`) écrit une commande.
    create: () => false,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [assignOrderNumber],
  },
  // Idempotence du webhook (issue #64, étendue 2026-08-20 pour la scission
  // précommande) : une session Stripe peut désormais produire DEUX Orders
  // (commande + précommande, même paiement) — `stripeSessionId` seul n'est
  // donc plus unique, la clé d'idempotence devient le COUPLE
  // `(stripeSessionId, orderType)`. `stripeSessionId` garde un index simple
  // (champ ci-dessous, `index: true`) pour les lectures par session
  // (`findOrderBySessionId`/`findOrdersByPaymentIntent` du support/export).
  indexes: [{ fields: ['stripeSessionId', 'orderType'], unique: true }],
  // `GET /api/orders/export/preparation` et `GET /api/orders/export/compta`
  // — deux profils d'export CSV (authentifié admin/éditeur, cf.
  // `order-export-handler.ts` pour le détail : filtrage, formatage,
  // en-têtes de réponse).
  endpoints: [
    {
      path: '/export/preparation',
      method: 'get',
      handler: exportPreparationHandler,
    },
    {
      path: '/export/compta',
      method: 'get',
      handler: exportComptaHandler,
    },
  ],
  fields: [
    {
      name: 'number',
      type: 'text',
      unique: true,
      label: 'N° de commande',
      admin: {
        readOnly: true,
        description: "Généré automatiquement à la création (préfixe CMD- + id) — ne se modifie pas.",
      },
      access: lockedAfterCreate,
    },
    {
      name: 'orderType',
      type: 'select',
      required: true,
      defaultValue: 'commande',
      index: true,
      label: 'Type',
      options: [
        { value: 'commande', label: 'Commande' },
        { value: 'precommande', label: 'Précommande' },
      ],
      access: lockedAfterCreate,
      admin: {
        description:
          'Commande normale (articles parus) ou précommande (articles à ' +
          'paraître avec « Ouvert à la précommande » coché) — posé par le ' +
          'webhook selon la scission du panier au paiement (client ' +
          '2026-08-20). Un panier mixte produit UNE commande de chaque ' +
          "type, même session/paiement Stripe, chacune avec SES lignes et " +
          'SES frais de port.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'paid',
      index: true,
      label: 'Statut',
      options: [
        { value: 'paid', label: 'Payée' },
        { value: 'prepared', label: 'Préparée' },
        { value: 'shipped', label: 'Expédiée' },
        { value: 'cancelled', label: 'Annulée' },
        { value: 'refunded', label: 'Remboursée' },
        { value: 'failed', label: 'Échec du paiement' },
      ],
      admin: {
        description:
          'Seul champ modifiable au back-office — suivi de préparation ' +
          '(paid → prepared → shipped) ; annulation/remboursement au besoin. ' +
          '« Échec du paiement » : posé par le webhook (checkout.session.' +
          'async_payment_failed) pour un moyen de paiement différé (ex. ' +
          "virement/prélèvement) dont la confirmation échoue APRÈS que " +
          "checkout.session.completed s'est déjà présenté en attente — trace " +
          "l'essai sans jamais décrémenter le stock (webhook route, lot 2 " +
          'étape 9).',
      },
    },
    {
      name: 'email',
      type: 'email',
      required: true,
      label: 'E-mail',
      access: lockedAfterCreate,
    },
    {
      name: 'shippingAddress',
      type: 'group',
      label: 'Adresse de livraison',
      access: lockedAfterCreate,
      fields: addressFields(),
    },
    {
      name: 'billingAddress',
      type: 'group',
      label: 'Adresse de facturation',
      access: lockedAfterCreate,
      admin: {
        description:
          'Dupliquée depuis la livraison par le webhook si le checkout ne ' +
          'collecte pas d’adresse de facturation distincte (étape 8).',
      },
      fields: addressFields(),
    },
    {
      name: 'lines',
      type: 'array',
      label: 'Lignes',
      labels: { singular: 'Ligne', plural: 'Lignes' },
      minRows: 1,
      access: lockedAfterCreate,
      admin: {
        description:
          'Snapshot au moment de la vente (titre/ISBN/prix) — indépendant ' +
          "d'une modification ultérieure de la fiche livre.",
      },
      fields: [
        {
          name: 'book',
          type: 'relationship',
          relationTo: 'books',
          required: true,
          label: 'Livre / produit',
        },
        {
          name: 'titleSnapshot',
          type: 'text',
          required: true,
          label: 'Titre (au moment de la vente)',
        },
        {
          name: 'isbnSnapshot',
          type: 'text',
          label: 'ISBN (au moment de la vente)',
        },
        {
          name: 'quantity',
          type: 'number',
          required: true,
          min: 1,
          label: 'Quantité',
        },
        {
          name: 'unitPriceTTC',
          type: 'number',
          required: true,
          min: 0,
          label: 'Prix unitaire TTC (€)',
        },
      ],
    },
    {
      name: 'shippingMethod',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      label: 'Méthode de port',
      access: lockedAfterCreate,
      options: [
        { value: 'standard', label: 'Standard (grille par valeur)' },
        { value: 'reduit', label: 'Réduit (« manifeste »)' },
        { value: 'offert', label: 'Offert (code promo)' },
      ] satisfies { value: ShippingMethodLabel; label: string }[],
    },
    {
      name: 'shippingCostTTC',
      type: 'number',
      required: true,
      min: 0,
      label: 'Port TTC (€)',
      access: lockedAfterCreate,
    },
    {
      name: 'promoCode',
      type: 'relationship',
      relationTo: 'promo-codes',
      label: 'Code promo appliqué',
      access: lockedAfterCreate,
    },
    {
      name: 'discountTTC',
      type: 'number',
      defaultValue: 0,
      min: 0,
      label: 'Remise TTC (€)',
      access: lockedAfterCreate,
    },
    {
      name: 'totalTTC',
      type: 'number',
      required: true,
      min: 0,
      label: 'Total TTC (€)',
      access: lockedAfterCreate,
    },
    {
      name: 'stripeSessionId',
      type: 'text',
      required: true,
      index: true,
      label: 'Session Stripe',
      access: lockedAfterCreate,
      admin: {
        description:
          "Clé d'idempotence du webhook avec « Type » (étape 9, étendue " +
          "2026-08-20) — une même session ne crée jamais deux commandes du " +
          'MÊME type, mais peut légitimement porter DEUX commandes (une ' +
          '« Commande » + une « Précommande ») pour un panier mixte.',
      },
    },
    {
      name: 'stripePaymentIntentId',
      type: 'text',
      label: 'Intention de paiement Stripe',
      access: lockedAfterCreate,
    },
    {
      name: 'paidAt',
      type: 'date',
      label: 'Payée le',
      access: lockedAfterCreate,
    },
    {
      name: 'stockDecremented',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      label: 'Stock décrémenté',
      access: lockedAfterCreate,
      admin: {
        readOnly: true,
        description:
          'Marqueur technique du webhook (issue #64 — reprise après échec partiel) : ' +
          "le stock des lignes de cette commande a-t-il déjà été décrémenté ? Un rejeu " +
          "Stripe ne redécrémente jamais tant que ce marqueur est vrai. Ne se modifie jamais à la main.",
      },
    },
    {
      name: 'confirmationSent',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      label: 'E-mail de confirmation envoyé',
      access: lockedAfterCreate,
      admin: {
        readOnly: true,
        description:
          "Marqueur technique du webhook (issue #64) : l'e-mail de confirmation de cette " +
          "commande a-t-il déjà été envoyé ? Ne se modifie jamais à la main.",
      },
    },
  ],
}
