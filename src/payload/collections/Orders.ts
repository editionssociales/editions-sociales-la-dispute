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
  // Les plus récentes en premier (propriété de collection, PAS `admin.*` —
  // même emplacement que `Rencontres.ts`).
  defaultSort: '-createdAt',
  admin: {
    group: 'Quotidien',
    useAsTitle: 'number',
    // Client (cellule dédiée `clientResume`, lit `shippingAddress.fullName`)
    // · Contenu (résumé des lignes, `contenuResume`) · Quand (`createdAt`,
    // champ natif — reste triable) · Montant · Statut · Type. Le n° de
    // commande SORT des colonnes par défaut (reste dispo dans le column
    // picker et en titre de fiche, `useAsTitle` inchangé).
    defaultColumns: ['clientResume', 'contenuResume', 'createdAt', 'totalTTC', 'status', 'orderType'],
    // Une libraire cherche un NOM avant un n°/e-mail — chemin imbriqué
    // fonctionnel côté requête (`mergeListSearchAndWhere` résout nativement
    // les chemins pointillés dans un `where` Payload) ; seul le libellé du
    // placeholder de recherche omettra ce champ (`getTextFieldsToBeSearched`
    // compare par `field.name` après aplatissement, jamais par accessor —
    // cosmétique, recon 2026-08-21). `lines.titleSnapshot` (recherche par
    // titre de livre, demande cliente) : même chemin pointillé À TRAVERS un
    // champ `array` — vérifié fonctionnel côté requête dans le code du SDK
    // (`getTableColumnFromPath`, `@payloadcms/drizzle`, `case 'array'` : join
    // vers la table de l'array puis résolution du reste du chemin), même
    // omission cosmétique du placeholder que ci-dessus (`flattenTopLevelFields`
    // ne hisse pas les sous-champs d'un `array`, contrairement à un `group`).
    listSearchableFields: ['shippingAddress.fullName', 'number', 'email', 'lines.titleSnapshot'],
    description:
      'Créées automatiquement au paiement. Vous ne modifiez ici que le statut de préparation. ' +
      'Un panier mixte (paru + précommande) peut créer deux commandes distinctes — voir « Type ».',
    // Chips de filtre (état) AVANT l'export CSV (action quotidienne avant
    // l'occasionnel, « descente de previews ») — cf.
    // `orders/OrdersFilterChipsPanel.tsx` et `OrderExportPanel.tsx`.
    components: {
      beforeListTable: [
        '/payload/admin/orders/OrdersFilterChipsPanel.tsx#OrdersFilterChipsPanel',
        '/payload/admin/OrderExportPanel.tsx#OrderExportPanel',
      ],
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
  // — deux MISES EN FORME du même ensemble de lignes, désigné par cette
  // liste : les commandes cochées quand il y en a (`ids`, la sélection
  // prime), les filtres et la recherche de la vue sinon (recopiés tels quels
  // par le panneau d'export, cf. `order-export-handler.ts`). Authentifié
  // admin/éditeur.
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
        description: 'Généré automatiquement à la création — ne se modifie pas.',
      },
      access: lockedAfterCreate,
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
        // Champ d'action de la fiche — sidebar, en tête (« descente de
        // previews » : l'utile au quotidien d'abord). Purement
        // présentationnel (`fieldIsSidebar`, recon 2026-08-21) : ne change
        // ni le nom du champ ni son verrouillage (`status` reste le seul
        // champ sans `access.update`, cf. `Orders.test.ts`).
        position: 'sidebar',
        description:
          'Seul champ modifiable ici — suivi de préparation (payée → préparée → expédiée), ' +
          'plus annulation/remboursement au besoin. « Échec du paiement » est posé ' +
          'automatiquement pour un paiement différé (virement, prélèvement) qui échoue.',
      },
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
        { value: 'don', label: 'Don' },
      ],
      access: lockedAfterCreate,
      admin: {
        position: 'sidebar',
        description:
          'Commande normale, précommande (article à paraître) ou don. Un panier mixte ' +
          '(paru + précommande) crée une commande de chaque type pour un même paiement. ' +
          '« Don » : jamais compté dans le chiffre d’affaires, mais suivi en préparation ' +
          'et expédition comme une commande normale.',
      },
    },
    {
      // Champ `ui` : `createdAt` n'existe pas dans `Orders.fields` (généré
      // automatiquement par Payload, recon 2026-08-21) — seul moyen de le
      // rendre lisible en sidebar, à côté de `paidAt`. Purement
      // présentationnel : `flattenTopLevelFields` (Orders.test.ts) l'exclut
      // d'office des traversées de verrouillage (`keepPresentationalFields`
      // non posé) — rien à verrouiller, un champ `ui` ne porte pas de
      // données.
      type: 'ui',
      name: 'createdAtResume',
      label: 'Créée le',
      admin: {
        position: 'sidebar',
        components: {
          Field: '/payload/admin/orders/OrderCreatedAtField.tsx#OrderCreatedAtField',
        },
      },
    },
    {
      name: 'paidAt',
      type: 'date',
      label: 'Payée le',
      access: lockedAfterCreate,
      admin: {
        position: 'sidebar',
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
      name: 'phone',
      type: 'text',
      label: 'Téléphone',
      access: lockedAfterCreate,
      admin: {
        description:
          'Peut être vide : non collecté sur les commandes anciennes, les dons et l’historique repris.',
      },
    },
    {
      name: 'shippingAddress',
      type: 'group',
      label: 'Adresse de livraison',
      access: lockedAfterCreate,
      fields: addressFields(),
    },
    {
      // Remonté juste après l'adresse de livraison (retour client : la
      // cliente ne trouvait pas ce champ 8ᵉ, après les résumés `ui`) — reste
      // AVANT `clientResume`/`contenuResume`, qui n'en sont que des synthèses
      // de colonne de liste.
      name: 'lines',
      type: 'array',
      label: 'Lignes',
      labels: { singular: 'Ligne', plural: 'Lignes' },
      minRows: 1,
      access: lockedAfterCreate,
      admin: {
        description:
          'Titre, ISBN et prix tels qu’au moment de la vente — ne changent pas si la fiche livre est modifiée depuis.',
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
      // Champ `ui` dédié plutôt qu'un chemin imbriqué
      // `shippingAddress.fullName` dans `defaultColumns` ou qu'un Cell posé
      // sur le groupe `shippingAddress` lui-même : les deux donneraient un
      // EN-TÊTE DE COLONNE dérivé du libellé du champ (« Nom complet » ou
      // « Adresse de livraison > Nom complet »), jamais « Client » — voir
      // `OrderClientCell.tsx`.
      type: 'ui',
      name: 'clientResume',
      label: 'Client',
      admin: {
        components: {
          Cell: '/payload/admin/orders/OrderClientCell.tsx#OrderClientCell',
        },
      },
    },
    {
      // Champ `ui` dédié plutôt qu'un Cell posé sur `lines` lui-même : la
      // colonne doit s'intituler « Contenu » alors que la section du
      // formulaire garde son libellé « Lignes » — voir
      // `OrderContentCell.tsx`.
      type: 'ui',
      name: 'contenuResume',
      label: 'Contenu',
      admin: {
        components: {
          Cell: '/payload/admin/orders/OrderContentCell.tsx#OrderContentCell',
        },
      },
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
      // Repli technique — replié par défaut (`initCollapsed`) : adresse de
      // facturation (si distincte) + identifiants Stripe + marqueurs
      // d'effet du webhook, jamais utiles au quotidien (« descente de
      // previews »). Purement présentationnel (`CollapsibleField` ne peut
      // structurellement pas porter de `name` — recon 2026-08-21) : ne
      // change ni le nom ni le chemin de données des champs qu'il contient,
      // ni leur verrouillage (`lockedAfterCreate`) — `flattenTopLevelFields`
      // les traverse comme s'ils étaient encore au premier niveau
      // (`Orders.test.ts`), et `payload-types.ts` n'en est pas affecté.
      type: 'collapsible',
      label: 'Technique',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'billingAddress',
          type: 'group',
          label: 'Adresse de facturation',
          access: lockedAfterCreate,
          admin: {
            description:
              'Identique à l’adresse de livraison si aucune adresse de facturation distincte n’a été saisie.',
          },
          fields: addressFields(),
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
              'Identifiant du paiement Stripe. Un panier mixte peut produire deux commandes ' +
              'avec le même identifiant (une « Commande » + une « Précommande »).',
          },
        },
        {
          name: 'stripePaymentIntentId',
          type: 'text',
          label: 'Intention de paiement Stripe',
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
            description: 'Indique si le stock de cette commande a déjà été décompté. Ne se modifie jamais à la main.',
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
            description: 'Indique si l’e-mail de confirmation a déjà été envoyé. Ne se modifie jamais à la main.',
          },
        },
      ],
    },
  ],
}
