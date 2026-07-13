'use client'

import { useState } from 'react'

import styles from './dashboard.module.css'

/**
 * Îlot client d'export CSV des commandes — bornes de dates optionnelles
 * (`AAAA-MM-JJ`, vides = toutes les commandes) + deux profils RÉELS, colonnes
 * validées par le client le 13/07 (`plan/04-commerce.md`) : « préparation »
 * (statuts payée/préparée, décalque AOE) et « compta » (toutes commandes,
 * TVA 5,5 % ventilée). Liens `GET` directs — la session admin passe par le
 * cookie Payload, pas besoin de fetch+blob.
 *
 * Partagé entre le panneau 3.10 du dashboard et `OrderExportPanel.tsx`
 * (slot `beforeListTable` de la liste des commandes) : un seul îlot export.
 */
export function OrderExportForm() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

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
