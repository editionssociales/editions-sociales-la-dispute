import styles from './dashboard.module.css'

/**
 * Graphique en barres SVG partagé des 3 vues ventes (« Ventes par jour » de
 * `Dashboard.tsx`, quotidien 30 j + mensuel 13 mois de `../ventes/VentesPage.tsx`)
 * — retour client (2026-08-22) : « les graphiques n'ont pas d'axes gradués, ni
 * de détail au survol » ; avant ce composant, chaque graphique ne portait que
 * le premier/dernier libellé + un maximum en coin, et un `<title>` SVG natif
 * par barre (lent, quasi inutilisable sur des barres fines).
 *
 * RSC purement présentationnel : AUCUNE logique métier — tout arrive en props
 * déjà calculées (`chartAxisTicks`/`everyNthLabels`/`salesChartGeometry`,
 * `derive.ts`). Zéro dépendance, zéro JavaScript client (pas de `'use
 * client'`, pas de hooks) : le survol par barre est intégralement porté par
 * CSS pur (`.barGroup:hover .barDetail`, `dashboard.module.css`) — même motif
 * que le lien étendu `.rowExpandable` de `Dashboard.tsx`, sans JS non plus.
 *
 * Anatomie par barre (`<g class="barGroup">`) :
 *   1. un rect de CAPTURE invisible, pleine hauteur/largeur de colonne (pas
 *      seulement la barre visible, souvent large de quelques px) — c'est LUI
 *      qui rend le survol praticable sur une barre fine ;
 *   2. la barre visible (`.chartBar`, classe existante) ;
 *   3. l'étiquette de détail (`.barDetail`) : chaque barre porte sa copie du
 *      texte à des coordonnées FIXES en haut à gauche du graphique (bande
 *      `topPadding`), masquée par défaut, révélée au survol du groupe — une
 *      seule visible à la fois, donc jamais de superposition avec les barres
 *      (retour client 2026-08-22) ; lisible sur tout fond via
 *      `paint-order: stroke` ;
 *   4. un `<title>` de repli (accessibilité — lecteur d'écran, appui long
 *      tactile), conservé en plus du texte visuel.
 *
 */

export interface SalesBarChartBar {
  x: number
  y: number
  w: number
  h: number
  /** Clé stable de la barre (jour `AAAA-MM-JJ` ou mois `AAAA-MM`) — clé de `details`. */
  key: string
}

export interface SalesBarChartTick {
  value: number
  /** Libellé déjà formaté (`fmtEurosAxis`) — ce composant ne formate rien. */
  label: string
}

export interface SalesBarChartXLabel {
  x: number
  label: string
  anchor: 'start' | 'middle' | 'end'
}

export interface SalesBarChartDims {
  width: number
  height: number
  /** Marge réservée au-dessus de la zone de barres — accueille l'étiquette de détail des barres les plus hautes. */
  topPadding: number
  barAreaHeight: number
}

export interface SalesBarChartProps {
  bars: SalesBarChartBar[]
  dims: SalesBarChartDims
  /** Lignes de grille horizontales, une par graduation (`chartAxisTicks`). */
  ticks: SalesBarChartTick[]
  /** Échelle partagée grille/barres — DOIT être le `maxValue` déjà passé à `salesChartGeometry` côté appelant. */
  axisMax: number
  xLabels: SalesBarChartXLabel[]
  /** Texte de survol par barre (clé = `bar.key`) — une barre sans entrée n'affiche ni détail ni `<title>`. */
  details: Map<string, string>
  ariaLabel: string
}

/**
 * Construit les `xLabels` (libellés sous l'axe) à partir d'indices de barres
 * DÉJÀ répartis (`everyNthLabels`, `derive.ts`) — factorisé ici plutôt que
 * dupliqué dans les 3 call-sites (`Dashboard.tsx`, quotidien + mensuel de
 * `../ventes/VentesPage.tsx`) : même géométrie partout (premier libellé ancré
 * au bord gauche du graphique, dernier au bord droit, les autres centrés sur
 * leur colonne — jamais de texte qui déborde du `viewBox`). Le TEXTE du
 * libellé reste au choix de l'appelant (`labelFor`, ex. `fmtDayMonthFr` pour
 * un axe quotidien, `bucket.label` pour un axe mensuel) : ce composant ne
 * formate rien.
 */
export function buildChartXLabels(
  bars: { x: number; w: number }[],
  indices: number[],
  width: number,
  labelFor: (index: number) => string,
): SalesBarChartXLabel[] {
  const last = bars.length - 1
  return indices
    .filter((i) => bars[i] !== undefined)
    .map((i) => {
      if (i === 0) return { x: 0, label: labelFor(i), anchor: 'start' as const }
      if (i === last) return { x: width, label: labelFor(i), anchor: 'end' as const }
      const bar = bars[i]
      return { x: bar.x + bar.w / 2, label: labelFor(i), anchor: 'middle' as const }
    })
}

export function SalesBarChart({ bars, dims, ticks, axisMax, xLabels, details, ariaLabel }: SalesBarChartProps) {
  const { width, height, topPadding, barAreaHeight } = dims

  const yForTick = (value: number) =>
    topPadding + barAreaHeight - (axisMax > 0 ? (value / axisMax) * barAreaHeight : 0)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.chartSvg} role="img" aria-label={ariaLabel}>
      {ticks.map((tick) => {
        const y = yForTick(tick.value)
        return (
          <g key={`tick-${tick.value}`}>
            <line x1={0} y1={y} x2={width} y2={y} className={styles.chartGridLine} />
            <text x={width} y={y - 3} textAnchor="end" className={styles.chartAxisLabel}>
              {tick.label}
            </text>
          </g>
        )
      })}

      {bars.map((bar) => {
        const detail = details.get(bar.key)
        return (
          <g key={bar.key} className={styles.barGroup}>
            <rect x={bar.x} y={topPadding} width={bar.w} height={barAreaHeight} className={styles.barCapture} />
            <rect
              x={bar.x}
              y={topPadding + bar.y}
              width={Math.max(bar.w - 2, 1)}
              height={bar.h}
              className={styles.chartBar}
            />
            {/* Lecture FIXE en haut à gauche (retour client 2026-08-22 : une
                étiquette flottant au-dessus de sa barre se superposait aux
                barres voisines plus hautes) — chaque barre porte SA copie du
                texte aux MÊMES coordonnées, seule celle du groupe survolé est
                révélée : une seule visible à la fois, superposition impossible.
                La bande `topPadding` lui est réservée ; les libellés € de
                l'axe vivent à droite, jamais de collision. */}
            {detail && (
              <text x={2} y={topPadding - 6} textAnchor="start" className={styles.barDetail}>
                {detail}
              </text>
            )}
            {detail && <title>{detail}</title>}
          </g>
        )
      })}

      {xLabels.map((xLabel) => (
        <text
          key={`x-${xLabel.x}-${xLabel.label}`}
          x={xLabel.x}
          y={height - 4}
          textAnchor={xLabel.anchor}
          className={styles.chartAxisLabel}
        >
          {xLabel.label}
        </text>
      ))}
    </svg>
  )
}
