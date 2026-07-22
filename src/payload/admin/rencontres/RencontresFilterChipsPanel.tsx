import { Suspense } from 'react'

import { isoDayParis, parisMidnightUtc } from '../../../lib/format.ts'
import { RencontresFilterChips } from './RencontresFilterChips.tsx'

/**
 * Wrapper serveur du slot `beforeListTable` de `Rencontres.ts` (même pattern
 * que `books/BooksFilterChipsPanel.tsx`) — calcule la borne « aujourd'hui »
 * (minuit civil Europe/Paris, `parisMidnightUtc`, `src/lib/format.ts`) à la
 * requête puis rend les chips de filtre (composant client,
 * `RencontresFilterChips.tsx`). Aucune lecture Payload ici — les chips ne
 * sont que des liens `where[...]` vers la liste native, déjà
 * filtrée/paginée par Payload.
 *
 * `Suspense` autour du composant client : `RencontresFilterChips` lit
 * `useSearchParams` — même garde qu'`BooksFilterChipsPanel.tsx` (recommandation
 * officielle Next, coût nul).
 */
export async function RencontresFilterChipsPanel() {
  const borne = parisMidnightUtc(isoDayParis(new Date()) ?? new Date().toISOString().slice(0, 10))

  return (
    <Suspense fallback={null}>
      <RencontresFilterChips borne={borne} />
    </Suspense>
  )
}
