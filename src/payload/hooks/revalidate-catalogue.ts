import { revalidateTag } from 'next/cache'

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * Invalidation du data-cache tagué `catalogue` (`src/lib/catalogue.ts` —
 * `unstable_cache([...], { tags: ['catalogue'], revalidate: 86400 })`, SEULE
 * source du catalogue) à l'écriture back-office. Hook dédié, sur le modèle
 * du template officiel Payload (paire `afterChange`/`afterDelete` autour de
 * `revalidateTag`) : read-your-writes immédiat, complémentaire au filet de
 * sécurité quotidien posé par le cache lui-même. Distinct de `revalidate.ts`
 * (purge ISR par chemin — page d'accueil, listes, fiches) : un levier
 * toujours nécessaire en parallèle, les deux caches ne se recouvrent pas.
 *
 * `{ expire: 0 }`, pas `'max'` (stale-while-revalidate) : constat live
 * 2026-07-19 (déjà posé dans `revalidate.ts`, repris ici pour la même
 * raison) — sans expiration bloquante, le premier re-rendu après édition
 * repartait d'une donnée périmée puis restait en cache jusqu'à l'échéance.
 *
 * Try/catch silencieux : `revalidateTag` jette hors du scope d'une requête
 * Next (Local API appelée depuis un script `payload run` qui aurait oublié
 * de poser `context.disableRevalidate`) — un `console.warn` suffit, jamais
 * un script cassé pour un cache qui expirera de toute façon sous 24 h.
 */
export function invalidateCatalogueTag(): void {
  try {
    revalidateTag('catalogue', { expire: 0 })
  } catch (err) {
    console.warn(
      '[revalidate-catalogue] revalidateTag("catalogue") a échoué (hors scope requête Next ?)',
      err,
    )
  }
}

/**
 * Hooks `books`/`authors`/`libelles`/`media` — tout ce que `getAllBooks`/
 * `getBook` résolvent en `depth: 2` depuis une fiche livre. Garde
 * `context.disableRevalidate` identique aux autres hooks du dossier, posée
 * par les scripts de seed/migration (`payload run`, hors requête HTTP) pour
 * ne pas déclencher une invalidation par fiche importée.
 */
export const revalidateCatalogueTagAfterChange: CollectionAfterChangeHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  invalidateCatalogueTag()
}

export const revalidateCatalogueTagAfterDelete: CollectionAfterDeleteHook = ({ req }) => {
  if (req.context?.disableRevalidate) return
  invalidateCatalogueTag()
}
