import { fmtDateTimeFr } from '../dashboard/derive.ts'
import styles from './order-created-at-field.module.css'

/**
 * Champ "Créée le" de la sidebar fiche Commande (`Orders.ts`, champ `ui`
 * `createdAtResume`) — lecture seule, purement informative. `createdAt`
 * n'est PAS un champ déclaré d'`Orders.fields` (auto-généré par Payload,
 * recon 2026-08-21) : ce champ `ui`, avec un composant `Field` custom, est
 * le seul moyen de l'afficher dans la sidebar, à côté de `paidAt` (champ
 * natif, lui aussi posé en sidebar). `fmtDateTimeFr` : cœur pur partagé avec
 * le dashboard (`derive.ts`). Composant serveur simple (`data` — le document
 * complet — suffit, aucune interactivité) : pas de `'use client'`.
 */
interface OrderCreatedAtFieldProps {
  data?: {
    createdAt?: unknown
  }
}

export function OrderCreatedAtField({ data }: OrderCreatedAtFieldProps) {
  const createdAt = typeof data?.createdAt === 'string' ? data.createdAt : null
  return (
    <div className={styles.block}>
      <p className={styles.label}>Créée le</p>
      <p className={styles.value}>{createdAt ? fmtDateTimeFr(createdAt) : '—'}</p>
    </div>
  )
}
