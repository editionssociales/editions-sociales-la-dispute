import { redirect } from 'next/navigation'

import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { Button, Pill } from '@payloadcms/ui'

import { pillStyleForState } from '../dashboard/dashboard-classes.ts'
import { readSalesHistory, SALES_HISTORY_MONTHS_BACK } from '../dashboard/data.ts'
import {
  chartAxisTicks,
  dailySalesBuckets,
  everyNthLabels,
  filterLinesByTitle,
  fmtDateFr,
  fmtDayMonthFr,
  fmtEuros,
  fmtEurosAxis,
  monthlySalesBuckets,
  parisDayRangeMs,
  rangeLineStats,
  salesChartGeometry,
  topTitles,
  topTitlesInRange,
  windowSalesStats,
  type DailySalesBucket,
} from '../dashboard/derive.ts'
import { buildChartXLabels, SalesBarChart } from '../dashboard/SalesBarChart.tsx'
import { isoDayParis, monthsAgoParisMonthStartUtc, parisMidnightUtc } from '../../../lib/format.ts'
import styles from '../dashboard/dashboard.module.css'
import ventesStyles from './ventes.module.css'

/**
 * Vue admin `/admin/ventes` — détail des ventes (entonnoir haut→bas : panneau
 * « Analyse libre » → bandeau KPI 30/90/365 j → graphique quotidien 30 j →
 * graphique mensuel 13 mois → titres les plus vendus → liens vers la liste
 * des commandes/l'export). La home (`../dashboard/Dashboard.tsx`) reste
 * concise (règle des 4 entrées) ; cette page porte la PROFONDEUR — c'est ici
 * que l'historique boutique Woo 2018→2026 prend son sens (saisonnalité, pics
 * de campagne visibles sur 13 mois), montage calqué EXACTEMENT sur
 * `../stock/StockPage.tsx` (clé de vue dédiée, `DefaultTemplate` manuel — cf.
 * le commentaire d'en-tête de `../health/HealthPage.tsx` pour le pourquoi du
 * chrome manuel — accès admin OU editor, PAS admin-only comme
 * `HealthPage.tsx`).
 *
 * Une seule lecture (`readSalesHistory`) nourrit TOUTE la page (panneau
 * « Analyse libre », bandeau KPI, les deux graphiques, les deux tables de
 * titres) — même discipline que `readSalesWindow` sur la home et
 * `/admin/stock`. Étanchéité comptable DURE partagée avec le reste du
 * dashboard : `windowSalesStats`/`dailySalesBuckets`/`rangeLineStats`
 * excluent déjà les dons (`orderType: 'don'`) des montants, cf. `derive.ts`.
 *
 * Le panneau « Analyse libre » (demande client : « rechercher les ventes sur
 * une période de notre choix, par titres etc. ») est un formulaire GET pur —
 * deux champs date (`from`/`to`, natifs `type="date"`, valeur AAAA-MM-JJ) et
 * un champ titre (`titre`), lus depuis `searchParams` (RSC, zéro JS client de
 * plus). Résultats calculés EN MÉMOIRE sur les lignes déjà chargées par
 * `readSalesHistory` (aucune requête Payload supplémentaire) via
 * `filterLinesByTitle` + `rangeLineStats`/`topTitlesInRange`. Une borne de
 * début antérieure à l'historique chargé (`SALES_HISTORY_MONTHS_BACK`, 13
 * mois) affiche un avertissement explicite plutôt qu'un total silencieusement
 * amputé (doctrine du dépôt).
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

/** ~1 libellé/semaine sur les 30 barres quotidiennes, ~1/trimestre sur les 13 barres mensuelles (`everyNthLabels`). */
const CHART_X_LABEL_TARGET = 5

const KPI_WINDOWS = [
  { days: 30, label: '30 derniers jours' },
  { days: 90, label: '90 derniers jours' },
  { days: 365, label: '12 derniers mois' },
] as const

/** Panier moyen (CA/commandes, 2 décimales) — tiret si aucune commande sur la période (jamais un 0,00 € inventé). */
function fmtPanierMoyen(ca: number, nbCommandes: number): string {
  return nbCommandes > 0 ? fmtEuros(ca / nbCommandes) : '—'
}

/** Premier paramètre d'une valeur de `searchParams` (Payload la type `string | string[] | undefined`), trim, ou `undefined` si vide. */
function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Barres mensuelles projetées sur la même géométrie que le graphique
 * quotidien (`salesChartGeometry`, `derive.ts`) — seaux mensuels adaptés en
 * forme de `DailySalesBucket` ({ day, ca }) juste pour le calcul de position,
 * même motif que `weeklyBars` dans `../stock/StockPage.tsx` (adaptation de
 * rendu, pas une nouvelle géométrie dans `derive.ts`). `maxValue` propagé tel
 * quel à `salesChartGeometry` — même échelle barres/grille que le graphique
 * quotidien (`axisMax` de `chartAxisTicks`, cf. `SalesBarChart.tsx`).
 */
function monthlyChartBars(
  buckets: { month: string; label: string; ca: number; nbCommandes: number }[],
  dims: { width: number; height: number },
  maxValue: number,
) {
  const asBuckets: DailySalesBucket[] = buckets.map((b) => ({ day: b.month, ca: b.ca }))
  return salesChartGeometry(asBuckets, dims, maxValue)
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

  // ── Analyse libre (panneau de recherche par période/titre, formulaire GET) ──
  const fromInput = firstParam(searchParams?.from)
  const toInput = firstParam(searchParams?.to)
  const titreInput = firstParam(searchParams?.titre) ?? ''
  const hasAnalysisQuery = Boolean(fromInput || toInput || titreInput)
  const loadedHistoryStart = monthsAgoParisMonthStartUtc(now, SALES_HISTORY_MONTHS_BACK)

  let analysisFromDay = ''
  let analysisToDay = ''
  let analysisError: string | null = null
  let analysisBeforeHistory = false
  let analysisStats: { ca: number; nbCommandes: number; nbExemplaires: number } | null = null
  let analysisTop: { title: string; exemplaires: number; ca: number }[] = []

  if (hasAnalysisQuery && salesHistory.state === 'ok') {
    // Dates par défaut = bornes de l'historique chargé : un titre seul (sans
    // date) analyse tout l'historique disponible, une date seule complète
    // l'autre avec aujourd'hui/le début de l'historique.
    analysisFromDay = fromInput ?? isoDayParis(loadedHistoryStart) ?? ''
    analysisToDay = toInput ?? isoDayParis(now) ?? ''
    const bounds =
      analysisFromDay && analysisToDay ? parisDayRangeMs(analysisFromDay, analysisToDay) : null
    if (!bounds) {
      analysisError = 'Dates invalides — utilisez le format AAAA-MM-JJ.'
    } else if (bounds.fromMs > bounds.toMs) {
      analysisError = 'La date de début est postérieure à la date de fin.'
    } else {
      analysisBeforeHistory = bounds.fromMs < loadedHistoryStart.getTime()
      const scopedRows = titreInput ? filterLinesByTitle(rows, titreInput) : rows
      analysisStats = rangeLineStats(scopedRows, bounds)
      analysisTop = topTitlesInRange(scopedRows, bounds, { max: TOP_TITLES_MAX })
    }
  }

  const dailyBuckets = salesHistory.state === 'ok' ? dailySalesBuckets(rows, now) : null
  const dailyMax = dailyBuckets ? Math.max(0, ...dailyBuckets.map((b) => b.ca)) : 0
  // Grille/barres à la même échelle (`axisMax`, jamais le maximum brut de la
  // série) — cf. le commentaire de `salesChartGeometry` (`derive.ts`).
  const dailyAxis = chartAxisTicks(dailyMax)
  const dailyBars = dailyBuckets
    ? salesChartGeometry(
        dailyBuckets,
        { width: DAILY_CHART_WIDTH, height: DAILY_CHART_BAR_AREA_HEIGHT },
        dailyAxis.axisMax,
      )
    : []
  const dailyTicks = dailyAxis.ticks.map((value) => ({ value, label: fmtEurosAxis(value) }))
  const dailyLabelIndices = dailyBuckets
    ? everyNthLabels(
        dailyBuckets.map((b) => b.day),
        CHART_X_LABEL_TARGET,
      )
    : []
  const dailyXLabels = dailyBuckets
    ? buildChartXLabels(dailyBars, dailyLabelIndices, DAILY_CHART_WIDTH, (i) => fmtDayMonthFr(dailyBuckets[i].day))
    : []
  // Détail au survol par barre — « 12 août — 148,50 € » (même formateur que
  // `../dashboard/Dashboard.tsx`, cf. `fmtDayMonthFr` dans `derive.ts`).
  const dailyDetails = new Map((dailyBuckets ?? []).map((b) => [b.day, `${fmtDayMonthFr(b.day)} — ${fmtEuros(b.ca)}`]))

  const monthlyBuckets = salesHistory.state === 'ok' ? monthlySalesBuckets(rows, now, MONTHLY_MONTHS) : null
  const monthlyMax = monthlyBuckets ? Math.max(0, ...monthlyBuckets.map((b) => b.ca)) : 0
  const monthlyAxis = chartAxisTicks(monthlyMax)
  const monthlyBars = monthlyBuckets
    ? monthlyChartBars(
        monthlyBuckets,
        { width: MONTHLY_CHART_WIDTH, height: MONTHLY_CHART_BAR_AREA_HEIGHT },
        monthlyAxis.axisMax,
      )
    : []
  const monthlyTicks = monthlyAxis.ticks.map((value) => ({ value, label: fmtEurosAxis(value) }))
  const monthlyLabelIndices = monthlyBuckets
    ? everyNthLabels(
        monthlyBuckets.map((b) => b.month),
        CHART_X_LABEL_TARGET,
      )
    : []
  const monthlyXLabels = monthlyBuckets
    ? buildChartXLabels(monthlyBars, monthlyLabelIndices, MONTHLY_CHART_WIDTH, (i) => monthlyBuckets[i].label)
    : []
  // Détail au survol par barre — « août 2026 — 4 210,00 € · 57 commandes »
  // (label + nbCommandes du seau, `MonthlySalesBucket`).
  const monthlyDetails = new Map(
    (monthlyBuckets ?? []).map((b) => [
      b.month,
      `${b.label} — ${fmtEuros(b.ca)} · ${b.nbCommandes} commande${b.nbCommandes > 1 ? 's' : ''}`,
    ]),
  )

  const top30 = salesHistory.state === 'ok' ? topTitles(rows, now, { days: 30, max: TOP_TITLES_MAX }) : []
  const top365 = salesHistory.state === 'ok' ? topTitles(rows, now, { days: 365, max: TOP_TITLES_MAX }) : []

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
          {/* ── 0. Analyse libre (recherche par période/titre) ── */}
          <section className={styles.panel} aria-labelledby="t-analyse">
            <h3 className={styles.panelTitle} id="t-analyse">
              Analyse libre
            </h3>
            <p className={styles.muted}>
              Période et/ou titre au choix, calculés sur l’historique déjà chargé
              ({SALES_HISTORY_MONTHS_BACK + 1} mois glissants) — CA hors frais de port (méthode
              « titres les plus vendus », ci-dessous).
            </p>
            <form method="GET" className={ventesStyles.filterForm}>
              <label className={ventesStyles.filterField}>
                <span>Du</span>
                <input type="date" name="from" defaultValue={fromInput ?? ''} />
              </label>
              <label className={ventesStyles.filterField}>
                <span>Au</span>
                <input type="date" name="to" defaultValue={toInput ?? ''} />
              </label>
              <label className={ventesStyles.filterField}>
                <span>Titre</span>
                <input type="text" name="titre" defaultValue={titreInput} placeholder="ex. Le Capital" />
              </label>
              <Button type="submit" buttonStyle="secondary" size="small">
                Analyser
              </Button>
              {hasAnalysisQuery && (
                // eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), réinitialisation du filtre par ancre pleine
                <a href="/admin/ventes">Réinitialiser</a>
              )}
            </form>
            {salesHistory.state === 'na' ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                indisponible
              </Pill>
            ) : (
              hasAnalysisQuery && (
                <div className={ventesStyles.analysisResult}>
                  {analysisError ? (
                    <p className={styles.alertText}>{analysisError}</p>
                  ) : (
                    <>
                      {analysisBeforeHistory && (
                        <p className={styles.alertText}>
                          période antérieure à l’historique chargé ({SALES_HISTORY_MONTHS_BACK + 1}{' '}
                          mois) — résultats partiels
                        </p>
                      )}
                      <div className={styles.kpiRow}>
                        <KpiCard
                          label={`${fmtDateFr(parisMidnightUtc(analysisFromDay))} → ${fmtDateFr(
                            parisMidnightUtc(analysisToDay),
                          )}${titreInput ? ` · « ${titreInput} »` : ''}`}
                          ca={analysisStats?.ca ?? 0}
                          nbCommandes={analysisStats?.nbCommandes ?? 0}
                          nbExemplaires={analysisStats?.nbExemplaires ?? 0}
                          caPrecommande={0}
                          deltaPct={null}
                        />
                      </div>
                      <TopTitlesTable title="Titres correspondants" rows={analysisTop} />
                    </>
                  )}
                </div>
              )
            )}
          </section>

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
              <SalesBarChart
                bars={dailyBars.map((bar) => ({ x: bar.x, y: bar.y, w: bar.w, h: bar.h, key: bar.day }))}
                dims={{
                  width: DAILY_CHART_WIDTH,
                  height: DAILY_CHART_HEIGHT,
                  topPadding: DAILY_CHART_TOP_PADDING,
                  barAreaHeight: DAILY_CHART_BAR_AREA_HEIGHT,
                }}
                ticks={dailyTicks}
                axisMax={dailyAxis.axisMax}
                xLabels={dailyXLabels}
                details={dailyDetails}
                ariaLabel={`Ventes par jour, du ${fmtDayMonthFr(
                  dailyBuckets[0]?.day ?? '',
                )} au ${fmtDayMonthFr(dailyBuckets[dailyBuckets.length - 1]?.day ?? '')}, maximum ${fmtEuros(
                  dailyMax,
                )}`}
              />
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
              <SalesBarChart
                bars={monthlyBars.map((bar) => ({ x: bar.x, y: bar.y, w: bar.w, h: bar.h, key: bar.day }))}
                dims={{
                  width: MONTHLY_CHART_WIDTH,
                  height: MONTHLY_CHART_HEIGHT,
                  topPadding: MONTHLY_CHART_TOP_PADDING,
                  barAreaHeight: MONTHLY_CHART_BAR_AREA_HEIGHT,
                }}
                ticks={monthlyTicks}
                axisMax={monthlyAxis.axisMax}
                xLabels={monthlyXLabels}
                details={monthlyDetails}
                ariaLabel={`Ventes par mois, de ${monthlyBuckets[0]?.label ?? ''} à ${
                  monthlyBuckets[monthlyBuckets.length - 1]?.label ?? ''
                }`}
              />
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
