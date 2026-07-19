import { Suspense } from 'react'

import type { BeforeListTableServerProps } from 'payload'

import { STOCK_SEUIL_FALLBACK } from '../dashboard/derive.ts'
import { BooksFilterChips } from './BooksFilterChips.tsx'

/**
 * Wrapper serveur du slot `beforeListTable` de `Books.ts` (issue #26,
 * pattern posé par `OrderExportPanel.tsx`/`Orders.ts`) — lit le seuil
 * d'alerte stock bas (`reglages-boutique.seuilAlerteStockBas`, même lecture
 * et même repli que `readLowStock`, `dashboard/data.ts` : illisible →
 * `STOCK_SEUIL_FALLBACK`, jamais une page cassée) puis rend les chips de
 * filtre (composant client, `BooksFilterChips.tsx`). Aucune autre lecture
 * ici — les chips ne sont que des liens `where[...]` vers la liste native,
 * déjà filtrée/paginée par Payload.
 *
 * `Suspense` autour du composant client : `BooksFilterChips` lit
 * `useSearchParams` — recommandation officielle Next (le panneau admin est
 * déjà rendu dynamiquement, cookie de session oblige, mais la limite ne
 * coûte rien et évite tout risque d'échec de build si l'analyse statique de
 * Next devait un jour re-scanner cette route).
 */
export async function BooksFilterChipsPanel({ payload }: BeforeListTableServerProps) {
  let seuil = STOCK_SEUIL_FALLBACK
  try {
    const settings = await payload.findGlobal({ slug: 'reglages-boutique', depth: 0 })
    seuil = settings?.seuilAlerteStockBas ?? STOCK_SEUIL_FALLBACK
  } catch {
    // Repli silencieux — seuil par défaut déjà posé ci-dessus.
  }

  return (
    <Suspense fallback={null}>
      <BooksFilterChips seuil={seuil} />
    </Suspense>
  )
}
