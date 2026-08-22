import { redirect } from 'next/navigation'

import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { Pill } from '@payloadcms/ui'

import { pillStyleForState } from '../dashboard/dashboard-classes.ts'
import { readSalesHistory } from '../dashboard/data.ts'
import {
  dailySalesBuckets,
  fmtEuros,
  monthlySalesBuckets,
  salesChartGeometry,
  topTitles,
  windowSalesStats,
  type DailySalesBucket,
} from '../dashboard/derive.ts'
import styles from '../dashboard/dashboard.module.css'
import ventesStyles from './ventes.module.css'

/**
 * Vue admin `/admin/ventes` — détail des ventes (entonnoir haut→bas : bandeau
 * KPI 30/90/365 j → graphique quotidien 30 j → graphique mensuel 13 mois →
 * titres les plus vendus → liens vers la liste des commandes/l'export). La
 * home (`../dashboard/Dashboard.tsx`) reste concise (règle des 4 entrées) ;
 * cette page porte la PROFONDEUR — c'est ici que l'historique boutique Woo
 * 2018→2026 prend son sens (saisonnalité, pics de campagne visibles sur 13
 * mois), montage calqué EXACTEMENT sur `../stock/StockPage.tsx` (clé de vue
 * dédiée, `DefaultTemplate` manuel — cf. le commentaire d'en-tête de
 * `../health/HealthPage.tsx` pour le pourquoi du chrome manuel — accès admin
 * OU editor, PAS admin-only comme `HealthPage.tsx`).
 *
 * Une seule lecture (`readSalesHistory`) nourrit TOUTE la page (bandeau KPI,
 * les deux graphiques, les deux tables de titres) — même discipline que
 * `readSalesWindow` sur la home et `/admin/stock`. Étanchéité comptable DURE
 * partagée avec le reste du dashboard : `windowSalesStats`/`dailySalesBuckets`
 * excluent déjà les dons (`orderType: 'don'`) des montants, cf. `derive.ts`.
 */

const DAILY_CHART_WIDTH = 880
const DAILY_CHART_HEIGHT = 180
const DAILY_CHART_TOP_PADDING = 20
const DAILY_CHART_BAR_AREA_HEIGHT = 118

const MONTHLY_CHART_WIDTH = 880
const MONTHLY_CHART_HEIGHT = 180
const MONTHLY_CHART_TOP_PADDING = 20
const MONTHLY_CHART_BAR_AREA_HEIGHT = 118

const MONTHLY_MONTHS = 13
const TOP_TITLES_MAX = 10

const KPI_WINDOWS = [
  { days: 30, label: '30 derniers jours' },
  { days: 90, label: '90 derniers jours' },
  { days: 365, label: '12 derniers mois' },
] as const

/**
 * Jour + mois sans année (« 12 août »), pour les infobulles du graphique
 * quotidien — `fmtDateFr` (`derive.ts`, réutilisé tel quel ailleurs sur cette
 * page) porte l'année, trop long pour une infobulle de barre. Utilitaire de
 * PRÉSENTATION local à cette vue (même pattern que `fmtVelocite`/
 * `fmtJoursRestants` dans `../stock/StockPage.tsx`) — pas une dérivation
 * métier, donc pas dans `derive.ts` (hors périmètre de cet agent).
 */
const DAY_MONTH_FR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
})
function fmtDayMonthFr(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '—' : DAY_MONTH_FR.format(t)
}

/** Panier moyen (CA/commandes, 2 décimales) — tiret si aucune commande sur la période (jamais un 0,00 € inventé). */
function fmtPanierMoyen(ca: number, nbCommandes: number): string {
  return nbCommandes > 0 ? fmtEuros(ca / nbCommandes) : '—'
}

/**
 * Barres mensuelles projetées sur la même géométrie que le graphique
 * quotidien (`salesChartGeometry`, `derive.ts`) — seaux mensuels adaptés en
 * forme de `DailySalesBucket` ({ day, ca }) juste pour le calcul de position,
 * même motif que `weeklyBars` dans `../stock/StockPage.tsx` (adaptation de
 * rendu, pas une nouvelle géométrie dans `derive.ts`).
 */
function monthlyChartBars(
  buckets: { month: string; label: string; ca: number; nbCommandes: number }[],
  dims: { width: number; height: number },
) {
  const asBuckets: DailySalesBucket[] = buckets.map((b) => ({ day: b.month, ca: b.ca }))
  return salesChartGeometry(asBuckets, dims)
}

interface KpiCardProps {
  label: string
  ca: number
  nbCommandes: number
  nbExemplaires: number
  caPrecommande: number
  deltaPct: number | null
}

function KpiCard({ label, ca, nbCommandes, nbExemplaires, caPrecommande, deltaPct }: KpiCardProps) {
  return (
    <div className={styles.kpiCard}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiAmount}>{fmtEuros(ca)}</span>
      <span className={styles.kpiMeta}>
        {nbCommandes} commande{nbCommandes > 1 ? 's' : ''} · {nbExemplaires} exemplaire
        {nbExemplaires > 1 ? 's' : ''} · panier moyen {fmtPanierMoyen(ca, nbCommandes)}
      </span>
      {caPrecommande > 0 && (
        <span className={styles.kpiMeta}>dont {fmtEuros(caPrecommande)} de précommandes</span>
      )}
      {deltaPct !== null && (
        <span className={styles.kpiDelta}>
          {deltaPct >= 0 ? '+' : ''}
          {Math.round(deltaPct)} % vs période précédente
        </span>
      )}
    </div>
  )
}

interface TopTitlesTableProps {
  title: string
  rows: { title: string; exemplaires: number; ca: number }[]
}

function TopTitlesTable({ title, rows }: TopTitlesTableProps) {
  return (
    <div className={ventesStyles.topTitlesCol}>
      <h4 className={styles.subBlockTitle}>{title}</h4>
      {rows.length === 0 ? (
        <p className={styles.empty}>Aucune vente sur la période.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">Titre</th>
                <th className={styles.right} scope="col">
                  Ex.
                </th>
                <th className={styles.right} scope="col">
                  CA
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.title}-${i}`}>
                  <td>{row.title}</td>
                  <td className={styles.right}>{row.exemplaires}</td>
                  <td className={styles.right}>{fmtEuros(row.ca)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export async function VentesPage(props: AdminViewServerProps) {
  const { initPageResult, params, payload, searchParams } = props

  const role = initPageResult.req.user?.role
  if (role !== 'admin' && role !== 'editor') {
    redirect('/admin')
  }

  const now = new Date()

  // Lecture unique de l'historique des ventes — bandeau KPI, les deux
  // graphiques et les deux tables de titres en dérivent tous, cf. l'en-tête
  // de ce fichier.
  const salesHistory = await readSalesHistory(payload, now)
  const rows = salesHistory.state === 'ok' ? salesHistory.rows : []

  const dailyBuckets = salesHistory.state === 'ok' ? dailySalesBuckets(rows, now) : null
  const dailyBars = dailyBuckets
    ? salesChartGeometry(dailyBuckets, { width: DAILY_CHART_WIDTH, height: DAILY_CHART_BAR_AREA_HEIGHT })
    : []
  const dailyMax = dailyBuckets ? Math.max(0, ...dailyBuckets.map((b) => b.ca)) : 0

  const monthlyBuckets = salesHistory.state === 'ok' ? monthlySalesBuckets(rows, now, MONTHLY_MONTHS) : null
  const monthlyBars = monthlyBuckets
    ? monthlyChartBars(monthlyBuckets, { width: MONTHLY_CHART_WIDTH, height: MONTHLY_CHART_BAR_AREA_HEIGHT })
    : []

  const top30 = salesHistory.state === 'ok' ? topTitles(rows, { days: 30, max: TOP_TITLES_MAX }) : []
  const top365 = salesHistory.state === 'ok' ? topTitles(rows, { days: 365, max: TOP_TITLES_MAX }) : []

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={initPageResult.req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <div className="gutter gutter--left gutter--right">
        <h1>Ventes — détail</h1>
        <p className={styles.muted}>
          Statuts payée/préparée/expédiée, dons avec contrepartie exclus des montants, historique
          boutique 2018→2026 inclus.
        </p>
        <div className={styles.board}>
          {/* ── 1. Bandeau KPI ── */}
          <section aria-labelledby="t-kpi">
            <h2 className={styles.zoneTitle} id="t-kpi">
              Vue d’ensemble
            </h2>
            {salesHistory.state === 'na' ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                indisponible
              </Pill>
            ) : (
              <div className={styles.kpiRow}>
                {KPI_WINDOWS.map(({ days, label }) => {
                  const stats = windowSalesStats(rows, days, now)
                  return (
                    <KpiCard
                      key={days}
                      label={label}
                      ca={stats.ca}
                      nbCommandes={stats.nbCommandes}
                      nbExemplaires={stats.nbExemplaires}
                      caPrecommande={stats.caPrecommande}
                      deltaPct={stats.deltaPct}
                    />
                  )
                })}
              </div>
            )}
          </section>

          {/* ── 2. Par jour ── */}
          <section className={styles.panel} aria-labelledby="t-jour">
            <h3 className={styles.panelTitle} id="t-jour">
              Par jour — 30 derniers jours
            </h3>
            {dailyBuckets === null ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                indisponible
              </Pill>
            ) : (
              <svg
                viewBox={`0 0 ${DAILY_CHART_WIDTH} ${DAILY_CHART_HEIGHT}`}
                className={styles.chartSvg}
                role="img"
                aria-label={`Ventes par jour, du ${fmtDayMonthFr(
                  dailyBuckets[0]?.day ?? '',
                )} au ${fmtDayMonthFr(dailyBuckets[dailyBuckets.length - 1]?.day ?? '')}, maximum ${fmtEuros(
                  dailyMax,
                )}`}
              >
                {dailyBars.map((bar) => (
                  <rect
                    key={bar.day}
                    x={bar.x}
                    y={DAILY_CHART_TOP_PADDING + bar.y}
                    width={Math.max(bar.w - 2, 1)}
                    height={bar.h}
                    className={styles.chartBar}
                  >
                    <title>
                      {fmtDayMonthFr(bar.day)} — {fmtEuros(bar.ca)}
                    </title>
                  </rect>
                ))}
                <text x={0} y={DAILY_CHART_HEIGHT - 4} className={styles.chartAxisLabel}>
                  {fmtDayMonthFr(dailyBuckets[0]?.day ?? '')}
                </text>
                <text
                  x={DAILY_CHART_WIDTH}
                  y={DAILY_CHART_HEIGHT - 4}
                  textAnchor="end"
                  className={styles.chartAxisLabel}
                >
                  {fmtDayMonthFr(dailyBuckets[dailyBuckets.length - 1]?.day ?? '')}
                </text>
                <text
                  x={DAILY_CHART_WIDTH}
                  y={DAILY_CHART_TOP_PADDING - 6}
                  textAnchor="end"
                  className={styles.chartAxisLabel}
                >
                  {fmtEuros(dailyMax)}
                </text>
              </svg>
            )}
          </section>

          {/* ── 3. Par mois ── */}
          <section className={styles.panel} aria-labelledby="t-mois">
            <h3 className={styles.panelTitle} id="t-mois">
              Par mois — {MONTHLY_MONTHS} derniers mois
            </h3>
            {monthlyBuckets === null ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                indisponible
              </Pill>
            ) : (
              <svg
                viewBox={`0 0 ${MONTHLY_CHART_WIDTH} ${MONTHLY_CHART_HEIGHT}`}
                className={styles.chartSvg}
                role="img"
                aria-label={`Ventes par mois, de ${monthlyBuckets[0]?.label ?? ''} à ${
                  monthlyBuckets[monthlyBuckets.length - 1]?.label ?? ''
                }`}
              >
                {monthlyBars.map((bar, i) => {
                  const bucket = monthlyBuckets[i]
                  return (
                    <rect
                      key={bar.day}
                      x={bar.x}
                      y={MONTHLY_CHART_TOP_PADDING + bar.y}
                      width={Math.max(bar.w - 2, 1)}
                      height={bar.h}
                      className={styles.chartBar}
                    >
                      {bucket && (
                        <title>
                          {bucket.label} — {fmtEuros(bucket.ca)} · {bucket.nbCommandes} commande
                          {bucket.nbCommandes > 1 ? 's' : ''}
                        </title>
                      )}
                    </rect>
                  )
                })}
                <text x={0} y={MONTHLY_CHART_HEIGHT - 4} className={styles.chartAxisLabel}>
                  {monthlyBuckets[0]?.label ?? ''}
                </text>
                <text
                  x={MONTHLY_CHART_WIDTH}
                  y={MONTHLY_CHART_HEIGHT - 4}
                  textAnchor="end"
                  className={styles.chartAxisLabel}
                >
                  {monthlyBuckets[monthlyBuckets.length - 1]?.label ?? ''}
                </text>
              </svg>
            )}
          </section>

          {/* ── 4. Titres les plus vendus ── */}
          <section className={styles.panel} aria-labelledby="t-titres">
            <h3 className={styles.panelTitle} id="t-titres">
              Titres les plus vendus
            </h3>
            {salesHistory.state === 'na' ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                indisponible
              </Pill>
            ) : (
              <div className={ventesStyles.topTitlesRow}>
                <TopTitlesTable title="30 derniers jours" rows={top30} />
                <TopTitlesTable title="12 derniers mois" rows={top365} />
              </div>
            )}
          </section>

          {/* ── 5. Liens ── */}
          <div className={styles.actions}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a href="/admin/collections/orders">Toutes les commandes →</a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office -- panneau d'export compta déjà porté par la liste des commandes (`OrderExportPanel.tsx`), ne pas le recréer ici */}
            <a href="/admin/collections/orders">Export compta (CSV) →</a>
          </div>
        </div>
      </div>
    </DefaultTemplate>
  )
}
