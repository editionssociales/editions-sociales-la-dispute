import type { PanelState } from './derive.ts'
import styles from './dashboard.module.css'

/**
 * Vocabulaire d'état partagé entre `Dashboard.tsx` (`beforeDashboard`, home),
 * `../stock/StockPage.tsx` et `../health/HealthPage.tsx` (vue dédiée
 * `/admin/sante`, issue #27) — mêmes pastilles/badges des deux côtés de la
 * grille native Payload. Le CSS-module (pastilles) vit ICI, jamais dans
 * `derive.ts` (cœur pur, zéro I/O, zéro import de styles) ; les badges texte
 * délèguent au `<Pill>` de `@payloadcms/ui` (issue #91).
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

/**
 * Nom accessible d'une pastille d'état — même texte que la légende
 * (`Legend.tsx`), condensé. La pastille (`dotClass`) ne se distingue sinon
 * QUE par la couleur (issue #89) : partout où son texte voisin ne varie pas
 * selon l'état (titres de panneau, ligne de commande en retard), on pose
 * `role="img" aria-label={dotLabel(state)}` sur le `<span>`.
 */
export function dotLabel(state: PanelState): string {
  const byState: Record<PanelState, string> = {
    ok: 'État : OK',
    warn: 'État : attention, à surveiller',
    alert: 'État : alerte, action requise',
    na: 'État : diagnostic indisponible',
  }
  return byState[state]
}

/**
 * Style `<Pill>` (`@payloadcms/ui`) pour un badge texte d'état (« liste
 * indisponible », etc.) — remplace l'ancien `badgeClass`/`.badge*` maison
 * (issue #91) : `<Pill>` est le composant Payload dédié à ce même besoin
 * (badge texte coloré), pas de raison de le redoubler.
 */
export function pillStyleForState(
  state: PanelState,
): 'error' | 'light-gray' | 'success' | 'warning' {
  const byState = {
    ok: 'success',
    warn: 'warning',
    alert: 'error',
    na: 'light-gray',
  } as const
  return byState[state]
}

