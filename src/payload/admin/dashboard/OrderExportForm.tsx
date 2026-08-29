'use client'

import { useSearchParams } from 'next/navigation'

import { useSelection } from '@payloadcms/ui'

import styles from './dashboard.module.css'

/**
 * Îlot client d'export CSV des commandes : deux liens `GET` (cookie Payload),
 * aucun critère propre — fusion de deux demandes cliente arrivées en
 * parallèle, résolue en UNE règle à deux niveaux :
 *
 * 1. **Des commandes sont cochées** (checkboxes de la liste) : les liens
 *    portent `ids=<liste>` — la sélection PRIME, rien d'autre n'est lu
 *    (`order-export-handler.ts`). Cocher est le geste le plus explicite qui
 *    soit : une commande cochée sort dans le fichier, quel que soit son
 *    statut.
 * 2. **Sinon** : les liens recopient les paramètres de FILTRE de la liste
 *    affichée (`where[…]` — filtres et chips — et `search`) ; PAS
 *    `page`/`limit` (un export porte sur l'ensemble des lignes filtrées,
 *    jamais sur la page affichée) ni `sort` (tri d'export fixe). Ce que la
 *    liste montre est ce que le CSV contient.
 *
 * Les deux profils ne sont qu'une mise en forme des colonnes
 * (préparation/expédition vs compta, cf. `src/lib/order-export.ts`).
 * Remplace un formulaire à critères propres (bornes de dates) : le client a
 * signalé que ces critères ne suivaient pas ce qu'il voyait à l'écran — on
 * filtre à UN endroit, la liste, et on coche pour préciser.
 *
 * `useSelection()` fonctionne ici car ce composant est monté via le slot
 * `beforeListTable` d'`Orders.ts` (`OrderExportPanel.tsx`) — DONC à
 * l'intérieur du `SelectionProvider` de la vue liste (vérifié dans le SDK,
 * `@payloadcms/ui` 3.79.1, `views/List/index.js`).
 *
 * Cas « Tout sélectionner » au-delà de la page (`selectAll === "allAvailable"`) :
 * `getSelectedIds()` n'y renvoie que les lignes de la page courante
 * (`Selection/index.js` : `toggleAll(true)` ne marque que `docs`) — une liste
 * d'ids serait un export partiel SILENCIEUX. Traité comme « pas de sélection
 * explicite », ce qui depuis la bascule vue-→-export est même devenu EXACT :
 * « tout sélectionner » désigne l'ensemble du filtre courant, et c'est
 * précisément ce que les liens exportent alors.
 */
export function OrderExportForm() {
  const search = useSearchParams()

  const { count, getSelectedIds, selectAll } = useSelection()
  const hasExplicitSelection = selectAll !== 'allAvailable' && count > 0
  const selectedIds = hasExplicitSelection ? getSelectedIds() : []

  function href(profile: 'preparation' | 'compta'): string {
    const params = new URLSearchParams()
    if (hasExplicitSelection) {
      params.set('ids', selectedIds.join(','))
    } else {
      for (const [key, value] of search.entries()) {
        if (key === 'search' || key.startsWith('where')) params.append(key, value)
      }
    }
    const qs = params.toString()
    return `/api/orders/export/${profile}${qs ? `?${qs}` : ''}`
  }

  return (
    <div className={styles.formRow}>
      {hasExplicitSelection && (
        <p className={styles.muted}>
          Sélection : {count} commande{count > 1 ? 's' : ''} cochée{count > 1 ? 's' : ''} — les
          liens ci-dessous portent sur cette sélection, filtres ignorés.
        </p>
      )}
      <a href={href('preparation')}>
        {hasExplicitSelection
          ? `Exporter la sélection (${count}) — préparation →`
          : 'Export préparation (CSV) →'}
      </a>
      <a href={href('compta')}>
        {hasExplicitSelection
          ? `Exporter la sélection (${count}) — compta →`
          : 'Export compta (CSV) →'}
      </a>
    </div>
  )
}
