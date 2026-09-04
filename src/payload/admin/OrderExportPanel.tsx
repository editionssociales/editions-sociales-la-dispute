'use client'

import { OrderExportForm } from './dashboard/OrderExportForm.tsx'
import styles from './dashboard/dashboard.module.css'

/**
 * Panneau « Export CSV » au-dessus de la liste des commandes (slot
 * `beforeListTable` d'`Orders.ts` — la clé d'importMap `chemin#export` de ce
 * fichier ne doit pas changer). Formulaire : `dashboard/OrderExportForm.tsx`
 * — deux liens, aucun critère.
 *
 * Colonnes du profil « compta » validées par le client le 13/07
 * (`plan/04-commerce.md`, décision n°5 close) ; celles du profil
 * « préparation » refondues à sa demande le 24/08 (date, adresse éclatée,
 * nom/prénom, téléphone — verbatim dans `order-export.ts`) — cf.
 * `order-export-handler.ts` pour le détail des profils.
 *
 * Le panneau n'a AUCUN critère à lui : l'export porte sur les commandes
 * cochées quand il y en a (la sélection prime), sur les lignes de la liste
 * telle qu'elle est filtrée sinon (filtres et recherche compris). C'est la
 * réponse au retour client « je n'ai pas l'impression que les paramètres
 * sélectionnés soient maintenus lors de l'export » — plutôt qu'un second
 * endroit où filtrer, plus aucun : on filtre la liste, on coche pour
 * préciser, on exporte — cf. `dashboard/OrderExportForm.tsx`.
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
        Exporte les commandes cochées, ou toute la liste filtrée si rien n&apos;est coché. «
        Préparation » : adresse, e-mail, téléphone. « Compta » : une ligne par commande, TVA
        détaillée.
      </p>
    </div>
  )
}
