import type {
  CollectionBeforeChangeHook,
  CollectionConfig,
  RelationshipFieldSingleValidation,
} from 'payload'
import { ValidationError } from 'payload'

import { isAdmin, isAdminOrEditor } from '../access.ts'

/**
 * Pose `contentTouched=true` dès qu'un humain crée/modifie une fiche hors
 * import de migration. C'est ce flag que lit `catalogue-pg-map.ts` (E4) pour
 * choisir entre le rendu `*LegacyHtml` figé et le Lexical réédité.
 *
 * Neutralisé pendant l'import (`req.context.migration`) — sans quoi chaque
 * run de migration basculerait les 295 fiches en rendu Lexical.
 */
const setContentTouched: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  if (req.context?.migration) {
    return data
  }
  if (operation === 'create' || operation === 'update') {
    return { ...data, contentTouched: true }
  }
  return data
}

/**
 * Cohérence `collection.edition === book.edition` : une fiche rattachée à une
 * collection éditoriale ne peut pas afficher une maison différente de celle
 * de la collection. Neutralisé pendant l'import (le script de migration a
 * déjà réconcilié collections/éditions en amont — cf. plan, section migration).
 */
const ensureCollectionEditionMatches: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (req.context?.migration) {
    return data
  }
  // Les données entrantes ne sont pas fusionnées avec le document existant :
  // un update partiel (bulk-edit) ne portant que `collection` OU `edition`
  // contournerait la contrainte — on complète chaque moitié manquante depuis
  // `originalDoc`.
  const effective = {
    collection: data?.collection ?? originalDoc?.collection,
    edition: data?.edition ?? originalDoc?.edition,
  }
  if (effective.collection && effective.edition) {
    const collectionId =
      typeof effective.collection === 'object' && effective.collection !== null
        ? (effective.collection as { id?: number | string }).id
        : effective.collection

    if (collectionId) {
      const relatedCollection = await req.payload.findByID({
        collection: 'collections',
        id: collectionId,
        req,
        depth: 0,
      })

      if (relatedCollection?.edition && relatedCollection.edition !== effective.edition) {
        throw new ValidationError({
          errors: [
            {
              path: 'collection',
              message: `Cette collection appartient à la maison « ${String(relatedCollection.edition)} », incompatible avec la maison « ${String(effective.edition)} » choisie pour ce livre.`,
            },
          ],
          req,
        })
      }
    }
  }
  return data
}

/**
 * Couverture requise pour toute fiche créée/modifiée par un humain — mais
 * pas au niveau du champ (`required`) car les imports de migration tolèrent
 * un média manquant (listé au rapport, cf. plan section E3/risque 11).
 */
const validateCover: RelationshipFieldSingleValidation = (value, { operation, req }) => {
  if (req.context?.migration) {
    return true
  }
  // Requise en CRÉATION de fiche neuve seulement (plan §Schéma) : sur un update
  // partiel (bulk-edit « Modifier », PATCH REST), `value` est absent des données
  // entrantes non fusionnées même quand la fiche a déjà une couverture — exiger
  // ici casserait toute mise à jour partielle.
  if (operation === 'create' && !value) {
    return 'La couverture est obligatoire pour une nouvelle fiche.'
  }
  return true
}

export const Books: CollectionConfig = {
  slug: 'books',
  labels: {
    singular: 'Livre',
    plural: 'Livres',
  },
  versions: {
    drafts: true,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'edition', 'dateParution', '_status'],
  },
  access: {
    // Un visiteur anonyme (front public via la Local API) ne voit que les fiches publiées ;
    // un utilisateur connecté (back-office) voit tout, y compris les brouillons.
    read: ({ req: { user } }) =>
      user
        ? true
        : {
            _status: { equals: 'published' },
          },
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    // Un editor ne supprime pas une fiche — seul un admin le peut (spec plan).
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [setContentTouched, ensureCollectionEditionMatches],
  },
  // Unicité couvrant l'espace `edition` ∪ null (contrat phase 4, ~20 produits
  // boutique-seuls sans maison) : ce composite `(edition, slug)` couvre le cas
  // général. Le complément — un index unique PARTIEL sur `slug` quand
  // `edition IS NULL` — n'est pas exprimable via l'API déclarative `indexes`
  // de Payload (pas de clause `where`) ; il devra être ajouté à la main dans
  // la migration SQL générée (hors périmètre de cette mission A2).
  indexes: [
    { fields: ['edition', 'slug'], unique: true },
    { fields: ['wpSource.site', 'wpSource.wpId'], unique: true },
  ],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Titre',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
      admin: {
        description: "Identifiant d'URL — ne pas modifier après publication",
      },
    },
    {
      name: 'edition',
      type: 'select',
      index: true,
      label: 'Maison',
      options: [
        { value: 'editions-sociales', label: 'Éditions sociales' },
        { value: 'la-dispute', label: 'La Dispute' },
      ],
    },
    {
      name: 'origin',
      type: 'select',
      required: true,
      defaultValue: 'catalogue',
      label: 'Origine',
      admin: {
        position: 'sidebar',
      },
      options: [
        { value: 'catalogue', label: 'Catalogue' },
        { value: 'boutique', label: 'Boutique' },
      ],
    },
    {
      name: 'presentation',
      type: 'richText',
      required: true,
      label: 'Présentation',
    },
    {
      name: 'presentationLegacyHtml',
      type: 'textarea',
      // Champ interne (parachute de parité) : jamais servi brut aux anonymes
      // via l'API REST publique de Payload — le front le consommera via la
      // Local API (overrideAccess) puis sanitizeCms (E4).
      access: { read: ({ req }) => Boolean(req.user) },
      admin: {
        hidden: true,
      },
    },
    {
      name: 'plusLoin',
      type: 'richText',
      label: 'Pour aller plus loin',
    },
    {
      name: 'plusLoinLegacyHtml',
      type: 'textarea',
      access: { read: ({ req }) => Boolean(req.user) },
      admin: {
        hidden: true,
      },
    },
    {
      name: 'contentTouched',
      type: 'checkbox',
      defaultValue: false,
      access: { read: ({ req }) => Boolean(req.user) },
      admin: {
        hidden: true,
      },
    },
    {
      name: 'isbn',
      type: 'text',
      label: 'ISBN',
    },
    {
      name: 'prix',
      type: 'number',
      min: 0,
      label: 'Prix (€)',
    },
    {
      name: 'pages',
      type: 'number',
      label: 'Pages',
    },
    {
      name: 'dateParution',
      type: 'date',
      required: true,
      label: 'Date de parution',
      admin: {
        date: {
          pickerAppearance: 'dayOnly',
          displayFormat: 'dd/MM/yyyy',
        },
      },
    },
    {
      name: 'sortDate',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        hidden: true,
        description: "Clé de tri du port — parité avec l'ordre WordPress",
      },
    },
    {
      name: 'aParaitre',
      type: 'checkbox',
      defaultValue: false,
      label: 'À paraître (informatif)',
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: true,
      label: 'Auteur·rice·s',
    },
    {
      name: 'collection',
      type: 'relationship',
      relationTo: 'collections',
      label: 'Collection',
    },
    {
      name: 'cover',
      type: 'relationship',
      relationTo: 'media',
      label: 'Couverture',
      validate: validateCover,
    },
    {
      name: 'coverFallbackUrl',
      type: 'text',
      access: { read: ({ req }) => Boolean(req.user) },
      admin: {
        hidden: true,
        description:
          'URL OVH de repli si le rapatriement du média a échoué (risque 11 du plan).',
      },
    },
    {
      name: 'tablePdf',
      type: 'relationship',
      relationTo: 'media',
      label: 'Table des matières (PDF)',
    },
    {
      name: 'extraitPdf',
      type: 'relationship',
      relationTo: 'media',
      label: 'Extrait (PDF)',
    },
    {
      name: 'buy',
      type: 'group',
      label: "Liens d'achat",
      fields: [
        {
          name: 'boutiqueUrl',
          type: 'text',
          label: 'Boutique',
        },
        {
          name: 'parislibrairies',
          type: 'text',
          label: 'Paris Librairies',
        },
        {
          name: 'lalibrairie',
          type: 'text',
          label: 'La Librairie',
        },
      ],
    },
    {
      name: 'wpSource',
      type: 'group',
      label: 'Source WordPress',
      access: { read: ({ req }) => Boolean(req.user) },
      admin: {
        readOnly: true,
        description: "Clé d'upsert de la migration — vide pour les fiches nées dans Payload.",
      },
      fields: [
        {
          name: 'site',
          type: 'select',
          label: 'Site',
          options: [
            { value: 'editions-sociales', label: 'Éditions sociales' },
            { value: 'la-dispute', label: 'La Dispute' },
          ],
        },
        {
          name: 'wpId',
          type: 'number',
          label: 'ID WordPress',
        },
        {
          name: 'wpSlug',
          type: 'text',
          label: 'Slug WordPress',
        },
        {
          name: 'wpDate',
          type: 'date',
          label: 'Date WordPress',
        },
      ],
    },
  ],
}
