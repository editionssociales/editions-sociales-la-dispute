import type { PayloadHandler } from 'payload'

import { isAdminOrEditor } from '../access.ts'
import {
  buildBookDraftData,
  parseBookDraftRequest,
  resolveUniqueSlug,
  slugifyTitle,
} from './book-draft-core.ts'

/**
 * Orchestration I/O de la création guidée « Nouveau livre » (cœur pur dans
 * `book-draft-core.ts`, issue #26, vue `/admin/nouveau-livre`) — même
 * découpage que `stock-import.ts` vis-à-vis de `stock-import-core.ts`.
 *
 * `POST /api/books/create-draft` (JSON, admin/éditeur authentifié) : slug
 * dérivé du titre, unicité résolue dans l'espace `(edition, slug)` (même
 * périmètre que l'index composite unique de `Books.ts`), écriture en
 * `draft: true` — jamais un livre publié sans présentation réelle depuis ce
 * point d'entrée. `overrideAccess: true` comme le reste des endpoints custom
 * de ce fichier (`import-stock`, `export/*`) : le rôle est déjà vérifié
 * explicitement ci-dessous, ces lectures/écritures n'ont pas besoin d'un
 * second passage par les règles `access` de `Books.ts`.
 */
export const createBookDraftHandler: PayloadHandler = async (req) => {
  if (isAdminOrEditor({ req }) !== true) {
    return Response.json(
      { error: 'Accès refusé — réservé aux administrateur·rice·s et éditeur·rice·s.' },
      { status: 403 },
    )
  }

  let rawBody: unknown
  try {
    // `req.json` est optionnel sur PayloadRequest (absent hors requête HTTP réelle).
    rawBody = await req.json?.()
  } catch {
    return Response.json({ error: 'Corps de requête invalide (JSON attendu).' }, { status: 400 })
  }

  const parsed = parseBookDraftRequest(rawBody)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const input = parsed.value

  const base = slugifyTitle(input.title)
  if (!base) {
    return Response.json(
      { error: 'Impossible de dériver un identifiant d’URL de ce titre — reformulez-le.' },
      { status: 400 },
    )
  }

  try {
    // `like` (contains) plutôt qu'un `equals` exact : on veut aussi voir
    // `base-2`, `base-3`… pour laisser `resolveUniqueSlug` choisir le premier
    // suffixe libre. Des faux positifs élargis par `like` sont sans
    // conséquence : seuls les candidats `base`/`base-N` exacts sont comparés.
    const { docs } = await req.payload.find({
      collection: 'books',
      where: {
        and: [{ edition: { equals: input.edition } }, { slug: { like: base } }],
      },
      depth: 0,
      limit: 0,
      overrideAccess: true,
      req,
    })
    const existingSlugs = docs.map((doc) => doc.slug)
    const slug = resolveUniqueSlug(base, existingSlugs)

    const doc = await req.payload.create({
      collection: 'books',
      draft: true,
      overrideAccess: true,
      data: buildBookDraftData({ ...input, slug }),
      req,
    })

    return Response.json({ id: doc.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    // Conflit résiduel de slug (course entre deux créations concurrentes sur
    // un même titre) : l'index unique `(edition, slug)` de `Books.ts` le
    // détecte à l'écriture — message clair plutôt que la 500 brute de Postgres.
    if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
      return Response.json(
        {
          error:
            'Un livre avec un identifiant d’URL identique vient d’être créé pour cette maison — réessayez.',
        },
        { status: 409 },
      )
    }
    req.payload.logger.error(`[create-draft] échec : ${message || 'erreur inconnue'}`)
    return Response.json({ error: 'Échec de la création du brouillon.' }, { status: 500 })
  }
}
