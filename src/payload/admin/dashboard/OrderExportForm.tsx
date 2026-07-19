'use client'

import { useState } from 'react'

import { defaultExportDateRange } from './derive.ts'
import styles from './dashboard.module.css'

/**
 * Îlot client d'export CSV des commandes — bornes `AAAA-MM-JJ` préremplies
 * (aujourd'hui Paris → un mois civil en arrière) + deux profils RÉELS,
 * colonnes validées par le client le 13/07 (`plan/04-commerce.md`) :
 * « préparation » (statuts payée/préparée) et « compta » (toutes commandes,
 * TVA 5,5 % ventilée). Liens `GET` directs — cookie Payload.
 *
 * Monté sur la liste des commandes (`OrderExportPanel.tsx`) — plus sur la
 * home dashboard.
 */
export function OrderExportForm() {
  const defaults = defaultExportDateRange(new Date())
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)

  function href(profile: 'preparation' | 'compta'): string {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const qs = params.toString()
    return `/api/orders/export/${profile}${qs ? `?${qs}` : ''}`
  }

  return (
    <div className={styles.formRow}>
      <label>
        Du <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      </label>
      <label>
        Au <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </label>
      <a href={href('preparation')}>Export préparation (CSV) →</a>
      <a href={href('compta')}>Export compta (CSV) →</a>
    </div>
  )
}
