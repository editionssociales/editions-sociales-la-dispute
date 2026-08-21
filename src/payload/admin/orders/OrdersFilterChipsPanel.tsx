import { Suspense } from 'react'

import { OrdersFilterChips } from './OrdersFilterChips.tsx'

/**
 * Wrapper serveur du slot `beforeListTable` d'`Orders.ts` (pattern posé par
 * `books/BooksFilterChipsPanel.tsx`/`rencontres/RencontresFilterChipsPanel.tsx`)
 * — déclaré AVANT `OrderExportPanel` dans `Orders.ts` : l'action quotidienne
 * de filtrage passe avant l'export CSV, plus occasionnel (« descente de
 * previews »). Aucune lecture I/O ici, contrairement aux deux autres
 * panneaux de chips (qui lisent un seuil/une borne) : les 6 chips sont des
 * combinaisons FIXES, connues à l'avance (cf. `OrdersFilterChips.tsx`).
 *
 * `Suspense` autour du composant client : `OrdersFilterChips` lit
 * `useSearchParams` — même garde que les deux autres panneaux de chips.
 */
export function OrdersFilterChipsPanel() {
  return (
    <Suspense fallback={null}>
      <OrdersFilterChips />
    </Suspense>
  )
}
