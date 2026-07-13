'use client'

import { OrderExportForm } from './dashboard/OrderExportForm.tsx'

/**
 * Panneau « Export CSV » au-dessus de la liste des commandes (slot
 * `beforeListTable` d'`Orders.ts` — la clé d'importMap `chemin#export` de ce
 * fichier ne doit pas changer). Le formulaire lui-même (bornes de dates +
 * deux profils) est partagé avec le panneau 3.10 du dashboard v2 :
 * `dashboard/OrderExportForm.tsx`, un seul îlot client d'export.
 *
 * Colonnes des deux profils validées par le client le 13/07
 * (`plan/04-commerce.md`, décision n°5 close) — cf.
 * `order-export-handler.ts` pour le détail des profils.
 */
export function OrderExportPanel() {
  return (
    <div
      style={{
        margin: '1rem 0',
        padding: '1rem',
        border: '1px solid var(--theme-border-color, #ccc)',
        borderRadius: 4,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Export CSV des commandes</h3>
      <OrderExportForm />
      <p style={{ marginBottom: 0, color: 'var(--theme-elevation-500, #666)' }}>
        Bornes vides = toutes les commandes. « Préparation » : décalque du profil Advanced Order
        Export historique (statuts « payée »/« préparée » uniquement). « Compta » : toutes
        commandes, TVA 5,5 % ventilée — colonnes des deux profils validées par le client le 13/07.
      </p>
    </div>
  )
}
