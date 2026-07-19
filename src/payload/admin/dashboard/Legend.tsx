import styles from './dashboard.module.css'

/**
 * Légende des 4 états du dashboard (design v2 — « jamais de vert par
 * défaut »). Rendue en pied de page : inconditionnellement par `Dashboard`
 * (home, tout rôle, depuis le lot A) et par `../health/HealthPage.tsx` (vue
 * `/admin/sante`, admin seul, issue #27) — une seule légende par lecteur,
 * toujours en dernier.
 */
export function DashboardLegend() {
  return (
    <div className={styles.legend} aria-label="Légende des états">
      <span>
        <span className={`${styles.dot} ${styles.dotOk}`} /> OK
      </span>
      <span>
        <span className={`${styles.dot} ${styles.dotWarn}`} /> Attention — à surveiller
      </span>
      <span>
        <span className={`${styles.dot} ${styles.dotAlert}`} /> Alerte — action requise
      </span>
      <span>
        <span className={`${styles.dot} ${styles.dotNa}`} /> Diagnostic indisponible (jamais «
        vert par défaut »)
      </span>
    </div>
  )
}
