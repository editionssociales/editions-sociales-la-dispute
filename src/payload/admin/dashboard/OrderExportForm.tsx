'use client'

import { useState } from 'react'

import { useSelection } from '@payloadcms/ui'

import { defaultExportDateRange } from './derive.ts'
import styles from './dashboard.module.css'

/**
 * Îlot client d'export CSV des commandes — bornes `AAAA-MM-JJ` préremplies
 * (aujourd'hui Paris → un mois civil en arrière) + deux profils RÉELS,
 * colonnes validées par le client le 13/07 (`plan/04-commerce.md`) :
 * « préparation » (statuts payée/préparée) et « compta » (toutes commandes,
 * TVA 5,5 % ventilée). Liens `GET` directs — cookie Payload.
 *
 * Monté sur la liste des commandes (`OrderExportPanel.tsx`, dans le slot
 * `beforeListTable` d'`Orders.ts`) — DONC à l'intérieur du `SelectionProvider`
 * de la vue liste (vérifié dans le SDK, `@payloadcms/ui` 3.79.1,
 * `views/List/index.js` : `BeforeListTable` est rendu comme enfant de
 * `SelectionProvider`) : `useSelection()` y fonctionne.
 *
 * Sélection explicite de commandes (checkboxes de la liste, demande cliente) :
 * si des lignes sont cochées, les deux liens portent `ids=<liste>` (PRIME sur
 * les dates côté `order-export-handler.ts`, qui ignore alors `from`/`to`) et
 * l'annoncent. Le cas « Tout sélectionner » au-delà de la page
 * (`SelectAllStatus.AllAvailable`, valeur `"allAvailable"`) ne porte PAS de
 * liste d'ids exhaustive — `getSelectedIds()` n'y renvoie que les lignes de
 * la page courante (`Selection/index.js` : `toggleAll(true)` ne marque que
 * `docs`, les documents affichés) — l'exporter tel quel serait un export
 * partiel SILENCIEUX, contraire au contrat du repo. Ce cas est donc traité
 * comme « pas de sélection explicite » (retombe sur les dates, comme sans
 * coche) avec une phrase qui l'explique plutôt qu'un lien trompeur.
 */
export function OrderExportForm() {
  // Initialiseur paresseux : `defaultExportDateRange(new Date())` ne
  // s'exécute qu'au montage (une seule fois, un seul appel partagé par les
  // deux bornes), jamais à chaque rendu — évite à la fois une divergence
  // serveur/client et une valeur qui change entre deux rendus du même montage.
  const [defaults] = useState(() => defaultExportDateRange(new Date()))
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)

  const { count, getSelectedIds, selectAll } = useSelection()
  const isSelectAllAvailable = selectAll === 'allAvailable'
  const hasExplicitSelection = !isSelectAllAvailable && count > 0
  const selectedIds = hasExplicitSelection ? getSelectedIds() : []

  function href(profile: 'preparation' | 'compta'): string {
    const params = new URLSearchParams()
    if (hasExplicitSelection) {
      params.set('ids', selectedIds.join(','))
    } else {
      if (from) params.set('from', from)
      if (to) params.set('to', to)
    }
    const qs = params.toString()
    return `/api/orders/export/${profile}${qs ? `?${qs}` : ''}`
  }

  return (
    <div className={styles.formRow}>
      {!hasExplicitSelection && (
        <>
          <label>
            Du <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Au <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </>
      )}
      {hasExplicitSelection && (
        <p className={styles.muted}>
          Sélection : {count} commande{count > 1 ? 's' : ''} cochée{count > 1 ? 's' : ''} — les
          liens ci-dessous portent sur cette sélection, dates ignorées.
        </p>
      )}
      {isSelectAllAvailable && (
        <p className={styles.muted}>
          « Tout sélectionner » porte sur l&apos;ensemble du filtre courant, sans liste précise de
          commandes — export par dates ci-dessus (décochez « Tout sélectionner » et cochez des
          commandes une à une pour exporter une sélection précise).
        </p>
      )}
      <a href={href('preparation')}>
        {hasExplicitSelection ? `Exporter la sélection (${count}) — préparation →` : 'Export préparation (CSV) →'}
      </a>
      <a href={href('compta')}>
        {hasExplicitSelection ? `Exporter la sélection (${count}) — compta →` : 'Export compta (CSV) →'}
      </a>
    </div>
  )
}
