import styles from './dashboard.module.css'

/**
 * Légende des 4 états du dashboard (design v2 — « jamais de vert par
 * défaut »). Rendue en pied de page : par `DashboardFooter` pour un admin
 * (sous 3.12/3.13), par `Dashboard` pour un editor (le footer lui rend
 * `null`) — une seule légende par lecteur, toujours en dernier.
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
