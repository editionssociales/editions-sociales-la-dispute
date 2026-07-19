'use client'

import { OrderExportForm } from './dashboard/OrderExportForm.tsx'

/**
 * Panneau « Export CSV » au-dessus de la liste des commandes (slot
 * `beforeListTable` d'`Orders.ts` — la clé d'importMap `chemin#export` de ce
 * fichier ne doit pas changer). Formulaire : `dashboard/OrderExportForm.tsx`
 * (bornes préremplies : aujourd'hui → un mois en arrière).
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
        Plage par défaut : aujourd&apos;hui et un mois en arrière (modifiable / vidable pour
        toutes les commandes). « Préparation » : statuts « payée »/« préparée ». « Compta » :
        toutes commandes, TVA 5,5 % ventilée.
      </p>
    </div>
  )
}
