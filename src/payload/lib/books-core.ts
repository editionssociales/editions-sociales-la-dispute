/**
 * Cœur pur de la contrainte « collection.edition === book.edition » (hook
 * `beforeChange` de `Books.ts`, `ensureCollectionEditionMatches`) : une fiche
 * rattachée à une collection éditoriale ne peut pas afficher une maison
 * différente de celle de la collection. Même découpage pur/impur que
 * `promo-code.ts`/`stock-import-core.ts` : le `findByID` (lecture de la
 * collection visée) et la traduction en `ValidationError` restent dans le
 * hook (I/O = adaptateur) — ce module ne connaît ni Payload ni ses erreurs.
 */

/** Relation Payload : id brut ou document peuplé (`depth` > 0) — les deux formes arrivent selon le contexte d'appel. */
type BookCollectionRelation = number | string | { id?: number | string } | null | undefined

/** Forme neutre de `data`/`originalDoc` telle que lue par le hook `beforeChange`. */
export interface BookEditionFields {
  collection?: BookCollectionRelation
  edition?: string | null
}

export interface CollectionEditionLookup {
  /** Id à résoudre par l'appelant via `payload.findByID({ collection: 'collections', id })`. */
  collectionId: number | string
  /** Maison choisie pour le livre, déjà fusionnée — comparée à celle de la collection une fois résolue. */
  bookEdition: string
}

/**
 * Détermine si une vérification est nécessaire et, si oui, avec quel id de
 * collection interroger.
 *
 * Fusionne `data`/`originalDoc` : un update partiel (bulk-edit) ne portant
 * que `collection` OU `edition` ne doit pas contourner la contrainte — on
 * complète chaque moitié manquante depuis `originalDoc`. Normalise aussi la
 * forme de la relation `collection` (id nu vs document peuplé).
 *
 * `undefined` = rien à vérifier (collection ou edition absente, ou relation
 * sans id exploitable) : l'appelant ne fait alors aucun `findByID`.
 */
export function resolveCollectionEditionLookup(
  data: BookEditionFields | null | undefined,
  originalDoc: BookEditionFields | null | undefined,
): CollectionEditionLookup | undefined {
  const collection = data?.collection ?? originalDoc?.collection
  const edition = data?.edition ?? originalDoc?.edition
  if (!collection || !edition) {
    return undefined
  }

  const collectionId = typeof collection === 'object' ? collection.id : collection
  if (!collectionId) {
    return undefined
  }

  return { collectionId, bookEdition: edition }
}

export type CollectionEditionVerdict = { ok: true } | { ok: false; message: string }

/**
 * Compare la maison choisie pour le livre à celle de la collection déjà
 * résolue (`findByID`, fait par l'appelant). `collectionEdition` absente
 * (champ non renseigné côté collection) = rien à contrôler.
 */
export function checkCollectionEditionMatch(
  bookEdition: string,
  collectionEdition: string | null | undefined,
): CollectionEditionVerdict {
  if (collectionEdition && collectionEdition !== bookEdition) {
    return {
      ok: false,
      message: `Cette collection appartient à la maison « ${collectionEdition} », incompatible avec la maison « ${bookEdition} » choisie pour ce livre.`,
    }
  }
  return { ok: true }
}
