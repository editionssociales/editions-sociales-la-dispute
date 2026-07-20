import type { PanelState } from './derive.ts'
import styles from './dashboard.module.css'

/**
 * Classes CSS partagées entre `Dashboard.tsx` (`beforeDashboard`, home) et
 * `../health/HealthPage.tsx` (vue dédiée `/admin/sante`, issue #27) — même
 * vocabulaire de pastilles/badges/bandeau des deux côtés de la grille native
 * Payload. Le CSS-module vit ICI, jamais dans `derive.ts` (cœur pur, zéro
 * I/O, zéro import de styles).
 */

/** Pastille ronde (dot) d'un état — panels, lignes de tableau, bandeau. */
export function dotClass(state: PanelState): string {
  const byState: Record<PanelState, string> = {
    ok: styles.dotOk,
    warn: styles.dotWarn,
    alert: styles.dotAlert,
    na: styles.dotNa,
  }
  return `${styles.dot} ${byState[state]}`
}

/** Badge texte d'un état — messages courts (« liste indisponible », etc.). */
export function badgeClass(state: PanelState): string {
  const byState: Record<PanelState, string> = {
    ok: styles.badgeOk,
    warn: styles.badgeWarn,
    alert: styles.badgeAlert,
    na: styles.badgeNa,
  }
  return `${styles.badge} ${byState[state]}`
}

