'use client'

import { OrderExportForm } from './dashboard/OrderExportForm.tsx'
import styles from './dashboard/dashboard.module.css'

/**
 * Panneau « Export CSV » au-dessus de la liste des commandes (slot
 * `beforeListTable` d'`Orders.ts` — la clé d'importMap `chemin#export` de ce
 * fichier ne doit pas changer). Formulaire : `dashboard/OrderExportForm.tsx`
 * (bornes préremplies : aujourd'hui → un mois en arrière).
 *
 * Colonnes des deux profils validées par le client le 13/07
 * (`plan/04-commerce.md`, décision n°5 close) — cf.
 * `order-export-handler.ts` pour le détail des profils.
 *
 * `.panel`/`.panelTitle`/`.muted` partagés de `dashboard.module.css` (issue
 * #91) — remplacent le style inline qui divergeait de ceux du dashboard
 * (bordure, rayon, gris de texte définis deux fois avec des valeurs
 * différentes).
 */
export function OrderExportPanel() {
  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Export CSV des commandes</h3>
      <OrderExportForm />
      <p className={styles.muted}>
        Plage par défaut : aujourd&apos;hui et un mois en arrière (modifiable / vidable pour
        toutes les commandes). « Préparation » : statuts « payée »/« préparée ». « Compta » :
        toutes commandes, TVA 5,5 % ventilée.
      </p>
    </div>
  )
}
