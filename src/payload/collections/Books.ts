import type {
  CollectionBeforeChangeHook,
  CollectionConfig,
  RelationshipFieldSingleValidation,
} from 'payload'
import { ValidationError } from 'payload'

import { isAdmin, isAdminOrEditor } from '../access.ts'
import {
  revalidateCatalogueAfterChange,
  revalidateCatalogueAfterDelete,
} from '../hooks/revalidate.ts'
import { checkCollectionEditionMatch, resolveCollectionEditionLookup } from '../lib/books-core.ts'
import { importStockHandler } from '../lib/stock-import.ts'

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
 *
 * Règle pure (fusion `data`/`originalDoc`, formes de relation, comparaison)
 * dans `../lib/books-core.ts` — ce hook reste un adapter mince : `findByID`
 * (I/O) et traduction en `ValidationError` restent ici.
 */
const ensureCollectionEditionMatches: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (req.context?.migration) {
    return data
  }

  const lookup = resolveCollectionEditionLookup(data, originalDoc)
  if (!lookup) {
    return data
  }

  const relatedCollection = await req.payload.findByID({
    collection: 'collections',
    id: lookup.collectionId,
    req,
    depth: 0,
  })

  const verdict = checkCollectionEditionMatch(lookup.bookEdition, relatedCollection?.edition)
  if (!verdict.ok) {
    throw new ValidationError({
      errors: [{ path: 'collection', message: verdict.message }],
      req,
    })
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
    group: 'Quotidien',
    useAsTitle: 'title',
    // Colonnes légères — pas de richText/legacy dans la liste (payload volumineux).
    defaultColumns: ['title', 'edition', 'cover', 'dateParution', '_status'],
    listSearchableFields: ['title', 'isbn', 'slug'],
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
    afterChange: [revalidateCatalogueAfterChange],
    afterDelete: [revalidateCatalogueAfterDelete],
  },
  // `POST /api/books/import-stock` — import stock routeur mensuel (multipart,
  // admin/éditeur authentifié) ; cf. `src/payload/lib/stock-import.ts` pour
  // le détail (auth, parsing, appariement, rapport, écritures).
  endpoints: [
    {
      path: '/import-stock',
      method: 'post',
      handler: importStockHandler,
    },
  ],
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
      type: 'tabs',
      tabs: [
        // Onglet par défaut (ouverture de fiche) : tout ce qui relève de la
        // rédaction éditoriale — jamais de prix/stock/champs techniques ici
        // (issue #24, critères d'acceptation).
        {
          label: 'Édition',
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
              name: 'presentation',
              type: 'richText',
              required: true,
              label: 'Présentation',
              admin: {
                disableListColumn: true,
                description:
                  'Tant que « Contenu réédité » (onglet Technique) est décoché, le site sert le HTML WordPress d’origine, pas ce Lexical.',
              },
            },
            {
              name: 'plusLoin',
              type: 'richText',
              label: 'Pour aller plus loin',
              admin: {
                disableListColumn: true,
              },
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
              name: 'aParaitre',
              type: 'checkbox',
              defaultValue: false,
              label: 'À paraître (informatif)',
            },
            {
              name: 'isbn',
              type: 'text',
              label: 'ISBN',
            },
            {
              name: 'pages',
              type: 'number',
              label: 'Pages',
            },
          ],
        },
        // Onglet vente en ligne — prix, canaux d'achat externes, pilotage du
        // commerce natif (panier/checkout).
        {
          label: 'Commerce',
          fields: [
            {
              name: 'prix',
              type: 'number',
              min: 0,
              label: 'Prix (€)',
              admin: {
                description:
                  'Prix TTC — la TVA 5,5 % est incluse et jamais recalculée au checkout.',
              },
            },
            {
              name: 'origin',
              type: 'select',
              required: true,
              defaultValue: 'catalogue',
              label: 'Origine',
              options: [
                { value: 'catalogue', label: 'Catalogue' },
                { value: 'boutique', label: 'Boutique' },
              ],
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
              name: 'commerce',
              type: 'group',
              label: 'Commerce natif',
              admin: {
                description: 'Vente en ligne native — pilote le panier et le checkout du site.',
              },
              fields: [
                {
                  name: 'sellable',
                  type: 'checkbox',
                  defaultValue: true,
                  label: 'Vendable nativement',
                  admin: {
                    description:
                      'Vendable en ligne par défaut ; décocher retire le titre de la vente sans le retirer du catalogue.',
                  },
                },
                {
                  name: 'stock',
                  type: 'number',
                  min: 0,
                  label: 'Stock',
                  admin: {
                    description:
                      'Champ unique livres + boutique ; vide = pas de décompte ; 0 = épuisé sans retrait du catalogue.',
                  },
                },
                {
                  name: 'stockSuivi',
                  type: 'select',
                  defaultValue: 'manuel',
                  label: 'Suivi du stock',
                  options: [
                    { value: 'routeur', label: 'Routeur (import mensuel)' },
                    { value: 'manuel', label: 'Manuel (saisie dans la fiche)' },
                  ],
                  admin: {
                    description:
                      "Posé automatiquement à « routeur » par l'import mensuel ; « manuel » (défaut) sinon.",
                  },
                },
                {
                  name: 'reducedShippingFlag',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'Port réduit (« manifeste »)',
                  admin: {
                    description:
                      "Un panier composé uniquement d'articles cochés bénéficie du tarif de port réduit.",
                  },
                },
                {
                  name: 'stockUpdatedAt',
                  type: 'date',
                  label: 'Stock mis à jour le',
                  admin: {
                    readOnly: true,
                    description:
                      "Posé automatiquement par l'import stock routeur mensuel " +
                      '(`POST /api/books/import-stock`) — jamais saisi à la main.',
                  },
                },
              ],
            },
          ],
        },
        // Onglet technique — legacy WordPress, parachutes de parité, clés de
        // migration. Reste visible pour tous les rôles (pas d'access par
        // champ), juste relégué en dernière position (choix acté issue #24).
        {
          label: 'Technique',
          fields: [
            {
              name: 'contentTouched',
              type: 'checkbox',
              defaultValue: false,
              label: 'Contenu réédité',
              access: { read: ({ req }) => Boolean(req.user) },
              admin: {
                readOnly: true,
                disableListColumn: true,
                description:
                  'Coché automatiquement dès qu’une humaine enregistre la fiche. Décoché = le front (source pg) affiche encore le HTML WordPress migrée.',
              },
            },
            {
              name: 'wpSource',
              type: 'group',
              label: 'Source WordPress',
              access: { read: ({ req }) => Boolean(req.user) },
              admin: {
                readOnly: true,
                description:
                  "Clé d'upsert de la migration — vide pour les fiches nées dans Payload.",
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
              name: 'presentationLegacyHtml',
              type: 'textarea',
              // Champ interne (parachute de parité) : jamais servi brut aux
              // anonymes via l'API REST publique de Payload — le front le
              // consommera via la Local API (overrideAccess) puis
              // sanitizeCms (E4).
              access: { read: ({ req }) => Boolean(req.user) },
              admin: {
                hidden: true,
                disableListColumn: true,
              },
            },
            {
              name: 'plusLoinLegacyHtml',
              type: 'textarea',
              access: { read: ({ req }) => Boolean(req.user) },
              admin: {
                hidden: true,
                disableListColumn: true,
              },
            },
          ],
        },
      ],
    },
  ],
}
