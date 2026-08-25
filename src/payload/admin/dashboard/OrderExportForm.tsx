'use client'

import { useSearchParams } from 'next/navigation'

import styles from './dashboard.module.css'

/**
 * Îlot client d'export CSV des commandes : deux liens `GET` (cookie Payload)
 * qui recopient les paramètres de FILTRE de la liste affichée — et rien
 * d'autre. Ce que la liste montre est ce que le CSV contient ; les deux
 * profils ne sont qu'une mise en forme des colonnes (préparation/expédition
 * vs compta, cf. `src/lib/order-export.ts`).
 *
 * Remplace un formulaire à critères propres (bornes de dates, puis type de
 * commande) : le client a signalé que ces critères ne suivaient pas ce qu'il
 * voyait à l'écran. Filtrer se fait donc à UN endroit, la liste elle-même,
 * avec ses filtres natifs (statut, type, dates, e-mail…) — il n'y a plus
 * deux endroits où filtrer, ni rien à maintenir en phase.
 *
 * Sont recopiés `where[…]` (filtres et chips) et `search` (recherche) ;
 * PAS `page`/`limit` — un export porte sur l'ensemble des lignes filtrées,
 * jamais sur la page affichée — ni `sort`, le tri de l'export étant fixe
 * (`order-export-handler.ts`).
 *
 * Monté sur la liste des commandes (`OrderExportPanel.tsx`).
 */
export function OrderExportForm() {
  const search = useSearchParams()

  function href(profile: 'preparation' | 'compta'): string {
    const params = new URLSearchParams()
    for (const [key, value] of search.entries()) {
      if (key === 'search' || key.startsWith('where')) params.append(key, value)
    }
    const qs = params.toString()
    return `/api/orders/export/${profile}${qs ? `?${qs}` : ''}`
  }

  return (
    <div className={styles.formRow}>
      <a href={href('preparation')}>Export préparation (CSV) →</a>
      <a href={href('compta')}>Export compta (CSV) →</a>
    </div>
  )
}
