import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  FieldHook,
  TextFieldValidation,
  UploadFieldSingleValidation,
} from 'payload'

import { isAdmin, isAdminOrEditor } from '../access.ts'
import {
  revalidateCatalogueAfterChange,
  revalidateCatalogueAfterDelete,
} from '../hooks/revalidate.ts'
import {
  authorIdsFromDoc,
  buildBookMediaAlt,
  mediaIdFromDoc,
  type BookMediaKind,
} from '../lib/cover-alt.ts'
import { trimIsbn, validateIsbnValue } from '../lib/isbn.ts'
import { slugify } from '../lib/slugify.ts'
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
 * Couverture requise pour toute fiche créée/modifiée par un humain — mais
 * pas au niveau du champ (`required`) car les imports de migration tolèrent
 * un média manquant (listé au rapport, cf. plan section E3/risque 11).
 */
const validateCover: UploadFieldSingleValidation = (value, { operation, req }) => {
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

const BOOK_MEDIA_ALT_FIELDS = [
  'cover',
  'tablePdf',
  'extraitPdf',
] as const satisfies readonly BookMediaKind[]

/**
 * Pose `media.alt` (couverture, table des matières, extrait) depuis titre +
 * auteur·rice·s à chaque sauvegarde humaine. Le front calcule déjà un alt
 * équivalent pour les images ; ce champ CMS sert l'accessibilité et la
 * cohérence back-office.
 */
const syncBookMediaAlts: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (req.context?.migration) return doc
  if (typeof doc.title !== 'string' || !doc.title.trim()) return doc

  const targets: { id: number; kind: BookMediaKind }[] = []
  for (const kind of BOOK_MEDIA_ALT_FIELDS) {
    const id = mediaIdFromDoc(doc[kind])
    if (id != null) targets.push({ id, kind })
  }
  if (targets.length === 0) return doc

  const authorIds = authorIdsFromDoc(doc.authors)
  let authorNames: string[] = []
  if (authorIds.length > 0) {
    const { docs: authors } = await req.payload.find({
      collection: 'authors',
      depth: 0,
      limit: authorIds.length,
      pagination: false,
      where: { id: { in: authorIds } },
      req,
    })
    const byId = new Map(authors.map((a) => [a.id, a.name]))
    authorNames = authorIds.map((id) => byId.get(id) ?? '').filter(Boolean)
  }

  for (const { id, kind } of targets) {
    const alt = buildBookMediaAlt(kind, doc.title, authorNames)
    const media = await req.payload.findByID({
      collection: 'media',
      id,
      depth: 0,
      req,
    })
    if (media.alt === alt) continue

    await req.payload.update({
      collection: 'media',
      id,
      data: { alt },
      overrideAccess: true,
      context: { disableRevalidate: true },
      req,
    })
  }
  return doc
}

/** ISBN optionnel ; format contrôlé hors import de migration (données héritées). */
const validateIsbn: TextFieldValidation = (value, { req }) => {
  if (req.context?.migration) {
    return true
  }
  return validateIsbnValue(value)
}

/** Espaces de bord retirés avant validation — saisie « 978-… » tolère le copier-coller. */
const trimIsbnField: CollectionBeforeValidateHook = ({ data, req }) => {
  if (req.context?.migration) {
    return data
  }
  if (typeof data?.isbn === 'string') {
    return { ...data, isbn: trimIsbn(data.isbn) }
  }
  return data
}

/**
 * Slug : normalise la saisie, ou dérive du titre si vide (création / API).
 * Sur un update partiel sans `slug` dans le payload, on conserve l'existant.
 */
const deriveSlugFromTitle: FieldHook = ({
  value,
  data,
  siblingData,
  operation,
  originalDoc,
}) => {
  if (typeof value === 'string' && value.trim()) {
    return slugify(value)
  }
  if (operation === 'update' && value === undefined) {
    return typeof originalDoc?.slug === 'string' ? originalDoc.slug : value
  }
  const title =
    (typeof siblingData?.title === 'string' && siblingData.title) ||
    (typeof data?.title === 'string' && data.title) ||
    (typeof originalDoc?.title === 'string' && originalDoc.title) ||
    ''
  if (title.trim()) return slugify(title)
  return value
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
    defaultColumns: ['title', 'edition', 'libelles', 'cover', 'dateParution', '_status'],
    listSearchableFields: ['title', 'isbn', 'slug'],
    // Chips de filtre État/Maison + bouton « Nouveau livre » (issue #26) —
    // au-dessus du tableau, cf. `BooksFilterChipsPanel.tsx` (même slot que
    // `OrderExportPanel.tsx`/`Orders.ts`).
    components: {
      beforeListTable: ['/payload/admin/books/BooksFilterChipsPanel.tsx#BooksFilterChipsPanel'],
    },
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
    beforeValidate: [trimIsbnField],
    beforeChange: [setContentTouched],
    afterChange: [syncBookMediaAlts, revalidateCatalogueAfterChange],
    afterDelete: [revalidateCatalogueAfterDelete],
  },
  // `POST /api/books/import-stock` — import stock routeur mensuel (multipart,
  // admin/éditeur authentifié) ; cf. `src/payload/lib/stock-import.ts` pour
  // le détail (auth, parsing, appariement, rapport, écritures).
  // Création de fiche : formulaire admin natif
  // (`/admin/collections/books/create`), pas d'endpoint custom.
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
              type: 'row',
              fields: [
                {
                  name: 'title',
                  type: 'text',
                  required: true,
                  label: 'Titre',
                  admin: { width: '65%' },
                },
                {
                  name: 'slug',
                  type: 'text',
                  required: true,
                  index: true,
                  label: 'Slug',
                  hooks: {
                    beforeValidate: [deriveSlugFromTitle],
                  },
                  admin: {
                    width: '35%',
                    description:
                      'Prérempli depuis le titre — ne pas modifier après publication',
                    components: {
                      Field: '/payload/admin/books/SlugFromTitleField.tsx#SlugFromTitleField',
                    },
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'edition',
                  type: 'select',
                  index: true,
                  label: 'Maison',
                  options: [
                    { value: 'editions-sociales', label: 'Éditions sociales' },
                    { value: 'la-dispute', label: 'La Dispute' },
                  ],
                  admin: { width: '33%' },
                },
                {
                  name: 'authors',
                  type: 'relationship',
                  relationTo: 'authors',
                  hasMany: true,
                  label: 'Auteur·rice·s',
                  admin: { width: '34%' },
                },
                {
                  name: 'libelles',
                  type: 'relationship',
                  relationTo: 'libelles',
                  hasMany: true,
                  label: 'Libellés',
                  admin: {
                    width: '33%',
                    description:
                      'Thèmes du catalogue (plusieurs possibles). Liste gérée sous Catalogue → Libellés.',
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'cover',
                  type: 'upload',
                  relationTo: 'media',
                  label: 'Couverture',
                  displayPreview: true,
                  filterOptions: {
                    mimeType: { contains: 'image' },
                  },
                  validate: validateCover,
                  admin: {
                    width: '34%',
                    className: 'book-upload-only',
                    description:
                      'Téléversez une image (glisser-déposer ou « Créer »). Pas de réutilisation depuis la bibliothèque — le texte alternatif est généré automatiquement.',
                  },
                },
                {
                  name: 'tablePdf',
                  type: 'upload',
                  relationTo: 'media',
                  label: 'Table des matières (PDF)',
                  displayPreview: true,
                  filterOptions: {
                    mimeType: { contains: 'pdf' },
                  },
                  admin: {
                    width: '33%',
                    className: 'book-upload-only',
                    description:
                      'Téléversez un PDF (glisser-déposer ou « Créer »). Pas de réutilisation depuis la bibliothèque — le texte alternatif est généré automatiquement.',
                  },
                },
                {
                  name: 'extraitPdf',
                  type: 'upload',
                  relationTo: 'media',
                  label: 'Extrait (PDF)',
                  displayPreview: true,
                  filterOptions: {
                    mimeType: { contains: 'pdf' },
                  },
                  admin: {
                    width: '33%',
                    className: 'book-upload-only',
                    description:
                      'Téléversez un PDF (glisser-déposer ou « Créer »). Pas de réutilisation depuis la bibliothèque — le texte alternatif est généré automatiquement.',
                  },
                },
              ],
            },
            {
              name: 'presentation',
              type: 'richText',
              required: true,
              label: 'Présentation',
              admin: {
                disableListColumn: true,
                description:
                  'À la première sauvegarde humaine, ce texte Lexical remplace le HTML WordPress d’origine sur le site.',
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
              type: 'row',
              fields: [
                {
                  name: 'dateParution',
                  type: 'date',
                  required: true,
                  label: 'Date de parution',
                  admin: {
                    width: '25%',
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
                  admin: { width: '20%' },
                },
                {
                  name: 'isbn',
                  type: 'text',
                  label: 'ISBN',
                  validate: validateIsbn,
                  admin: {
                    width: '35%',
                    placeholder: '978-2-35367-036-9',
                    description:
                      'ISBN-13 (ou ISBN-10). Tirets facultatifs — ex. 978-2-35367-036-9. La clé de contrôle est vérifiée.',
                  },
                },
                {
                  name: 'pages',
                  type: 'number',
                  label: 'Pages',
                  admin: { width: '20%' },
                },
              ],
            },
          ],
        },
        // Onglet vente en ligne — prix, canaux d'achat externes, pilotage du
        // commerce natif (panier/checkout).
        {
          label: 'Commerce',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'prix',
                  type: 'number',
                  min: 0,
                  label: 'Prix (€)',
                  admin: {
                    width: '25%',
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
                  admin: { width: '25%' },
                },
              ],
            },
            {
              name: 'buy',
              type: 'group',
              label: "Liens d'achat",
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'boutiqueUrl',
                      type: 'text',
                      label: 'Boutique',
                      admin: { width: '34%' },
                    },
                    {
                      name: 'parislibrairies',
                      type: 'text',
                      label: 'Paris Librairies',
                      admin: { width: '33%' },
                    },
                    {
                      name: 'lalibrairie',
                      type: 'text',
                      label: 'La Librairie',
                      admin: { width: '33%' },
                    },
                  ],
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
                  type: 'row',
                  fields: [
                    {
                      name: 'sellable',
                      type: 'checkbox',
                      defaultValue: true,
                      label: 'Vendable nativement',
                      admin: {
                        width: '50%',
                        description:
                          'Vendable en ligne par défaut ; décocher retire le titre de la vente sans le retirer du catalogue.',
                      },
                    },
                    {
                      name: 'reducedShippingFlag',
                      type: 'checkbox',
                      defaultValue: false,
                      label: 'Port réduit (« manifeste »)',
                      admin: {
                        width: '50%',
                        description:
                          "Un panier composé uniquement d'articles cochés bénéficie du tarif de port réduit.",
                      },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'stock',
                      type: 'number',
                      min: 0,
                      label: 'Stock',
                      admin: {
                        width: '20%',
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
                        width: '40%',
                        description:
                          "Posé automatiquement à « routeur » par l'import mensuel ; « manuel » (défaut) sinon.",
                      },
                    },
                    {
                      name: 'stockUpdatedAt',
                      type: 'date',
                      label: 'Stock mis à jour le',
                      admin: {
                        width: '40%',
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
          ],
        },
      ],
    },
    // Champs internes (migration / parachute de parité) — hors UI admin.
    // Ancien onglet Technique (issue #24) retiré : plus de surface éditoriale.
    {
      name: 'contentTouched',
      type: 'checkbox',
      defaultValue: false,
      label: 'Contenu réédité',
      // Lisible par TOUS : la lecture publique du front passe par
      // `PUBLIC_BOOKS_READ` (`overrideAccess: false`, contrat anti-brouillon)
      // — un champ réservé aux connectés y devient `undefined`, et le
      // parachute `renderHtml(legacy, lexical, contentTouched)` basculait
      // silencieusement sur le Lexical pour tout le monde (constat live,
      // audit 2026-07-19). Reste hors UI admin.
      access: { read: () => true },
      admin: {
        hidden: true,
        readOnly: true,
        disableListColumn: true,
      },
    },
    {
      name: 'wpSource',
      type: 'group',
      label: 'Source WordPress',
      access: { read: ({ req }) => Boolean(req.user) },
      admin: {
        hidden: true,
        readOnly: true,
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
      },
    },
    {
      name: 'sortDate',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        hidden: true,
      },
    },
    {
      name: 'presentationLegacyHtml',
      type: 'textarea',
      // Champ parachute : lisible par TOUS. L'hypothèse d'origine (« le
      // front le consommera via la Local API avec overrideAccess ») était
      // fausse : la lecture publique (`PUBLIC_BOOKS_READ`) garde
      // `overrideAccess: false` pour le contrat anti-brouillon, donc un
      // champ réservé aux connectés était invisible du rendu — le site
      // servait le Lexical partout, parachute mort (constat live, audit
      // 2026-07-19). Exposer le HTML brut via l'API publique est sans
      // enjeu : même contenu que la page, sanitisé au rendu (sanitizeCms).
      access: { read: () => true },
      admin: {
        hidden: true,
        disableListColumn: true,
      },
    },
    {
      name: 'plusLoinLegacyHtml',
      type: 'textarea',
      // Lisible par TOUS — même raison que `presentationLegacyHtml`.
      access: { read: () => true },
      admin: {
        hidden: true,
        disableListColumn: true,
      },
    },
  ],
}
