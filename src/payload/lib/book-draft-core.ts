import type { Book } from '../../payload-types.ts'

/**
 * Cœur pur de la création guidée « Nouveau livre » (endpoint `POST
 * /api/books/create-draft`, vue `/admin/nouveau-livre`, issue #26) — slug,
 * résolution d'unicité, contenu Lexical placeholder, validation du corps de
 * requête et assemblage des données du brouillon. Aucune I/O ici :
 * `payload.find`/`payload.create` (résolution des slugs existants, écriture)
 * restent dans `book-draft-handler.ts`, même découpage pur/impur que
 * `stock-import-core.ts`.
 */

/** Slug dérivé du titre : minuscules, diacritiques retirés, tirets, bornes propres. */
export function slugifyTitle(title: string): string {
  return title
    .normalize('NFD')
    // Marques diacritiques combinantes (U+0300–U+036F) laissées par la
    // décomposition NFD ci-dessus — retirées explicitement en points de code
    // \u pour rester lisibles/diffables (un caractère combinant littéral dans
    // le source est invisible à l'œil et fragile à l'édition).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Ajoute un suffixe `-2`, `-3`… jusqu'à trouver un slug absent de
 * `slugsExistants` — résolution appliquée côté application, AVANT
 * l'écriture, sur l'espace `(edition, slug)` (même périmètre que l'index
 * composite unique de `Books.ts`). Un conflit résiduel (course entre deux
 * créations concurrentes sur un même titre) reste possible : il est détecté
 * à l'écriture par l'appelant (`book-draft-handler.ts`) et traduit en erreur
 * claire, pas en 500 brute.
 */
export function resolveUniqueSlug(base: string, slugsExistants: string[]): string {
  if (!slugsExistants.includes(base)) return base
  let suffix = 2
  while (slugsExistants.includes(`${base}-${suffix}`)) {
    suffix += 1
  }
  return `${base}-${suffix}`
}

/**
 * Contenu Lexical minimal d'un brouillon fraîchement créé — un paragraphe
 * portant un texte d'invite, jamais un champ vide (`presentation` est
 * `required`, cf. `Books.ts`, y compris en brouillon : la validation
 * `required` est assouplie par `draft: true`, mais on ne construit jamais de
 * fiche sans texte de départ — critère d'acceptation issue #26, « pas de
 * livre publié sans présentation réelle »).
 *
 * Forme structurellement identique à `defaultRichTextValue`
 * (`@payloadcms/richtext-lexical/dist/populateGraphQL/defaultValue.js`) et à
 * la fixture `lexicalDoc` de `catalogue-pg-map.test.ts` — `lexical` (le
 * paquet) n'est pas une dépendance directe de ce dépôt (pnpm ne le hisse pas,
 * cf. le commentaire équivalent de `catalogue-pg-map.ts`), d'où le typage
 * structurel via `Book['presentation']` (généré, `payload-types.ts`) plutôt
 * qu'un import direct de `lexical`.
 */
export function buildLexicalPlaceholder(): Book['presentation'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: 'Présentation à compléter.',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

/** Maisons acceptées par la création guidée — mêmes valeurs que le champ `edition` de `Books.ts`. */
export const BOOK_DRAFT_EDITIONS = ['editions-sociales', 'la-dispute'] as const

export interface BookDraftRequestBody {
  title: string
  edition: (typeof BOOK_DRAFT_EDITIONS)[number]
  authors: number[]
  coverId: number
  dateParution: string
  prix?: number
  stock?: number
}

export type BookDraftRequestParsed =
  | { ok: true; value: BookDraftRequestBody }
  | { ok: false; error: string }

/**
 * Valide le corps JSON de `POST /create-draft` — 7 champs au plus (critère
 * d'acceptation issue #26) : titre, maison, auteur·rice·s, couverture, date
 * de parution, prix et stock (ces deux derniers optionnels). Aucune I/O :
 * l'appelant a déjà lu `req.json()`.
 */
export function parseBookDraftRequest(body: unknown): BookDraftRequestParsed {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Corps de requête invalide (JSON attendu).' }
  }
  const raw = body as Record<string, unknown>

  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) {
    return { ok: false, error: 'Le titre est obligatoire.' }
  }

  const edition = typeof raw.edition === 'string' ? raw.edition : ''
  if (!BOOK_DRAFT_EDITIONS.includes(edition as (typeof BOOK_DRAFT_EDITIONS)[number])) {
    return { ok: false, error: 'La maison (Éditions sociales / La Dispute) est obligatoire.' }
  }

  const authors = Array.isArray(raw.authors)
    ? raw.authors.filter((value): value is number => typeof value === 'number')
    : []
  if (authors.length === 0) {
    return { ok: false, error: 'Au moins un·e auteur·rice est requis·e.' }
  }

  const coverId =
    typeof raw.coverId === 'number' && Number.isInteger(raw.coverId) ? raw.coverId : null
  if (!coverId) {
    return { ok: false, error: 'La couverture est obligatoire.' }
  }

  const dateParution = typeof raw.dateParution === 'string' ? raw.dateParution : ''
  if (!dateParution || Number.isNaN(Date.parse(dateParution))) {
    return { ok: false, error: 'La date de parution est invalide.' }
  }

  const prix = typeof raw.prix === 'number' && Number.isFinite(raw.prix) ? raw.prix : undefined
  const stock = typeof raw.stock === 'number' && Number.isFinite(raw.stock) ? raw.stock : undefined

  return {
    ok: true,
    value: {
      title,
      edition: edition as (typeof BOOK_DRAFT_EDITIONS)[number],
      authors,
      coverId,
      dateParution,
      prix,
      stock,
    },
  }
}

export interface BookDraftData extends BookDraftRequestBody {
  /** Slug déjà résolu unique (`resolveUniqueSlug`) — jamais recalculé ici. */
  slug: string
}

/**
 * Assemble les données du brouillon : `_status: 'draft'` (jamais publié
 * directement — la présentation reste un placeholder tant qu'un·e humaine ne
 * l'a pas réédité), `sortDate` alignée sur `dateParution` (parité de tri du
 * port, cf. `sortDate` dans `Books.ts`), `presentation` = placeholder
 * Lexical. `commerce` n'est posé que si un stock est fourni — les autres
 * sous-champs (`sellable`, `stockSuivi`…) gardent leur défaut de schéma.
 *
 * Typé `Partial<Book>` (généré, `payload-types.ts`) plutôt que
 * `Record<string, unknown>` : ce dernier ne serait pas assignable au `data`
 * attendu par `payload.create` (chaque valeur y est `unknown`, incompatible
 * avec les types précis de `Book`) sans caster à l'aveugle côté appelant.
 */
export function buildBookDraftData(input: BookDraftData): Partial<Book> {
  const data: Partial<Book> = {
    title: input.title,
    slug: input.slug,
    edition: input.edition,
    authors: input.authors,
    cover: input.coverId,
    dateParution: input.dateParution,
    sortDate: input.dateParution,
    presentation: buildLexicalPlaceholder(),
    _status: 'draft',
  }
  if (typeof input.prix === 'number') {
    data.prix = input.prix
  }
  if (typeof input.stock === 'number') {
    data.commerce = { stock: input.stock }
  }
  return data
}
