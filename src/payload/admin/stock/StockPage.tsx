import { redirect } from 'next/navigation'

import type { AdminViewServerProps, Payload } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { Pill } from '@payloadcms/ui'

import { dotClass, dotLabel, pillStyleForState } from '../dashboard/dashboard-classes.ts'
import { readLastImportRun, readSalesWindow, readStockOutlook } from '../dashboard/data.ts'
import {
  bucketWeeklyQuantities,
  editionTag,
  fmtDateFr,
  fmtDateTimeFr,
  IMPORT_ALERT_DAYS,
  importSignal,
  salesChartGeometry,
  STOCK_SEUIL_FALLBACK,
  stockRowState,
  worstState,
  type DailySalesBucket,
  type PanelState,
  type SalesChartBar,
  type SalesWindowRow,
  type StockOutlookRow,
} from '../dashboard/derive.ts'
import styles from '../dashboard/dashboard.module.css'
import { DashboardLegend } from '../dashboard/Legend.tsx'
import { StockImportForm } from '../dashboard/StockImportForm.tsx'
import stockStyles from './stock.module.css'

/**
 * Vue admin `/admin/stock` — écran complet « Évolution du stock » : une table
 * unique de tous les titres vendables suivis (stock, vélocité 30 j,
 * projection de rupture, mini-historique 8 semaines), l'import routeur
 * (formulaire + dernier run) rangé dessous. Contrairement à la home
 * (`Dashboard.tsx`, cap 4 entrées par panneau), c'est la vue « voir tout » du
 * stock — seuil d'alerte compris, remplace l'ancien panneau « stock bas
 * ≤ seuil » (design v2 §3.3).
 *
 * Accès admin OU editor (même périmètre que `Books.access.update`) ; le
 * formulaire d'import reste admin-only. Chrome `DefaultTemplate` manuel —
 * même raison que `../health/HealthPage.tsx`.
 */

const SPARK_WIDTH = 120
const SPARK_HEIGHT = 24
const WEEKLY_BUCKETS = 8

/**
 * Seuil d'alerte stock bas (`reglages-boutique.seuilAlerteStockBas`) — lu
 * directement ici, même lecture et même repli que
 * `../books/BooksFilterChipsPanel.tsx` (précédent déjà établi dans ce dépôt
 * pour ce global précis, hors `dashboard/data.ts`) : illisible →
 * `STOCK_SEUIL_FALLBACK`, jamais une page cassée. Cette page ne consomme
 * plus la liste pré-filtrée de l'ancien `readLowStock` (`dashboard/data.ts`,
 * hors périmètre de cet agent) — remplacée par la table complète ci-dessous —
 * seul le seuil numérique lui reste utile, pour le marquage ligne à ligne.
 */
async function readSeuilAlerteStockBas(
  payload: Payload,
): Promise<{ seuil: number; seuilIllisible: boolean }> {
  try {
    const settings = await payload.findGlobal({
      slug: 'reglages-boutique',
      select: { seuilAlerteStockBas: true },
      depth: 0,
    })
    return { seuil: settings?.seuilAlerteStockBas ?? STOCK_SEUIL_FALLBACK, seuilIllisible: false }
  } catch {
    return { seuil: STOCK_SEUIL_FALLBACK, seuilIllisible: true }
  }
}

/** État de ligne : gris si stock non renseigné, `stockRowState` sous le seuil, OK au-dessus. */
function stockDotState(row: StockOutlookRow, seuil: number): PanelState {
  if (row.stock === null) return 'na'
  if (row.stock <= seuil) return stockRowState(row.stock)
  return 'ok'
}

/** « épuisé » prime sur toute projection ; sinon jours restants approximatifs, ou tiret si non calculable. */
function fmtJoursRestants(row: StockOutlookRow): string {
  if (row.stock !== null && row.stock <= 0) return 'épuisé'
  return row.joursRestants === null ? '—' : `~${row.joursRestants} j`
}

/** Vélocité quotidienne, virgule française — tiret si aucune vente sur la fenêtre 30 j. */
function fmtVelocite(velociteJour: number): string {
  return velociteJour > 0 ? `${velociteJour.toFixed(1).replace('.', ',')}/j` : '—'
}

interface StockSections {
  tracked: StockOutlookRow[]
  nonSuivis: StockOutlookRow[]
}

/**
 * Tri produit de cette page : épuisés d'abord (le plus vendu des épuisés en
 * tête — un titre à forte demande resté à 0 est plus urgent qu'un titre qui
 * ne se vendait déjà plus), puis rupture prévue la plus proche, puis sans
 * projection calculable, puis stock non renseigné à part (`nonSuivis`, rendu
 * en section séparée — plus lisible qu'une colonne « — » partout). Aucune
 * nouvelle dérivation métier : uniquement un tri/regroupement sur les champs
 * déjà calculés par `stockOutlook` (`derive.ts`).
 */
function sortStockRows(rows: StockOutlookRow[]): StockSections {
  const epuises: StockOutlookRow[] = []
  const avecProjection: StockOutlookRow[] = []
  const sansProjection: StockOutlookRow[] = []
  const nonSuivis: StockOutlookRow[] = []

  for (const row of rows) {
    if (row.stock === null) nonSuivis.push(row)
    else if (row.stock <= 0) epuises.push(row)
    else if (row.joursRestants !== null) avecProjection.push(row)
    else sansProjection.push(row)
  }

  epuises.sort((a, b) => b.vendus30j - a.vendus30j || a.title.localeCompare(b.title, 'fr'))
  avecProjection.sort((a, b) => (a.joursRestants ?? Infinity) - (b.joursRestants ?? Infinity))
  sansProjection.sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  nonSuivis.sort((a, b) => a.title.localeCompare(b.title, 'fr'))

  return { tracked: [...epuises, ...avecProjection, ...sansProjection], nonSuivis }
}

/**
 * Quantités vendues (lignes de `readSalesWindow`) regroupées par livre —
 * adaptation de rendu demandée par la mission de cette page (« si sa forme de
 * seaux diffère de celle attendue par `salesChartGeometry`, adapte les
 * données côté rendu »), pas une nouvelle dérivation métier : simple
 * regroupement des lignes déjà lues (une seule requête, `readSalesWindow`),
 * qui nourrit ensuite `bucketWeeklyQuantities` (`derive.ts`) titre par titre.
 */
function salesByBook(rows: SalesWindowRow[]): Map<number, { date: string; quantity: number }[]> {
  const byBook = new Map<number, { date: string; quantity: number }[]>()
  for (const row of rows) {
    const date = row.paidAt ?? row.createdAt
    for (const line of row.lines) {
      if (line.book === null) continue
      const list = byBook.get(line.book)
      if (list) list.push({ date, quantity: line.quantity })
      else byBook.set(line.book, [{ date, quantity: line.quantity }])
    }
  }
  return byBook
}

/**
 * Mini-barres « Ventes 8 semaines » : mappe les 8 seaux hebdomadaires sur la
 * géométrie de `salesChartGeometry` (même forme que le futur graphique ventes
 * de `Dashboard.tsx` — `ca` porte ici une quantité d'exemplaires, pas un CA,
 * mapping simple explicitement permis par la mission plutôt que d'ajouter une
 * géométrie dédiée dans `derive.ts`).
 */
function weeklyBars(weekly: number[]): SalesChartBar[] {
  const asBuckets: DailySalesBucket[] = weekly.map((quantity, i) => ({ day: String(i), ca: quantity }))
  return salesChartGeometry(asBuckets, { width: SPARK_WIDTH, height: SPARK_HEIGHT })
}

/** Mini-graphique inline « Ventes 8 semaines » — alt textuel complet pour lecteur d'écran. */
function Sparkline({ weekly }: { weekly: number[] }) {
  const bars = weeklyBars(weekly)
  return (
    <svg
      aria-label={`Ventes des 8 dernières semaines, de la plus ancienne à la plus récente : ${weekly.join(', ')}`}
      className={stockStyles.sparkline}
      height={SPARK_HEIGHT}
      role="img"
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      width={SPARK_WIDTH}
    >
      {bars.map((bar, i) => (
        <rect key={i} height={bar.h} width={Math.max(bar.w - 2, 1)} x={bar.x} y={bar.y} />
      ))}
    </svg>
  )
}

export async function StockPage(props: AdminViewServerProps) {
  const { initPageResult, params, payload, searchParams } = props

  const role = initPageResult.req.user?.role
  if (role !== 'admin' && role !== 'editor') {
    redirect('/admin')
  }
  const admin = role === 'admin'
  const now = new Date()

  // Lecture unique des ventes (KPI/vélocité/mini-barres partagent cette même
  // fenêtre, cf. `readSalesWindow`) avant tout ce qui en dépend.
  const salesWindow = await readSalesWindow(payload, now)
  const [stockOutlookData, importRun, seuilInfo] = await Promise.all([
    readStockOutlook(payload, salesWindow, now),
    readLastImportRun(payload),
    readSeuilAlerteStockBas(payload),
  ])

  const rows = stockOutlookData.state === 'ok' ? stockOutlookData.rows : []
  const { tracked, nonSuivis } = sortStockRows(rows)
  const byBook = salesByBook(salesWindow.state === 'ok' ? salesWindow.rows : [])

  const panelState: PanelState =
    stockOutlookData.state === 'na'
      ? 'na'
      : worstState(rows.map((row) => stockDotState(row, seuilInfo.seuil)))

  const importState: PanelState =
    importRun.state === 'na' ? 'na' : importSignal(importRun.run?.createdAt ?? null, now)

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
        <h1>Stock — évolution et prévisions</h1>
        <div className={styles.board}>
          <section className={styles.panel} id="panneau-stock" aria-labelledby="t-stock">
            <h2 className={styles.panelTitle} id="t-stock">
              <span className={dotClass(panelState)} role="img" aria-label={dotLabel(panelState)} />{' '}
              Évolution et prévisions
            </h2>

            {stockOutlookData.state === 'na' ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                vue d’ensemble du stock indisponible
              </Pill>
            ) : rows.length === 0 ? (
              <p className={styles.empty}>Aucun titre vendable suivi.</p>
            ) : (
              <>
                {tracked.length > 0 && (
                  <div className={styles.tableWrap}>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th scope="col">Titre</th>
                          <th className={styles.right} scope="col">
                            Stock actuel
                          </th>
                          <th className={styles.right} scope="col">
                            Vendus 30 j
                          </th>
                          <th className={styles.right} scope="col">
                            Vélocité
                          </th>
                          <th className={styles.right} scope="col">
                            Jours restants
                          </th>
                          <th scope="col">Rupture prévue</th>
                          <th scope="col">Ventes 8 semaines</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tracked.map((row) => {
                          const state = stockDotState(row, seuilInfo.seuil)
                          const weekly = bucketWeeklyQuantities(
                            byBook.get(row.id) ?? [],
                            now,
                            WEEKLY_BUCKETS,
                          )
                          return (
                            <tr key={row.id}>
                              <td>
                                {state !== 'ok' && (
                                  <>
                                    <span
                                      className={dotClass(state)}
                                      role="img"
                                      aria-label={dotLabel(state)}
                                    />{' '}
                                  </>
                                )}
                                <a href={`/admin/collections/books/${row.id}`}>{row.title}</a>{' '}
                                <span className={styles.tag}>{editionTag(row.edition)}</span>
                              </td>
                              <td className={styles.right}>{row.stock}</td>
                              <td className={styles.right}>{row.vendus30j}</td>
                              <td className={styles.right}>{fmtVelocite(row.velociteJour)}</td>
                              <td className={styles.right}>{fmtJoursRestants(row)}</td>
                              <td>{row.rupturePrevue ? fmtDateFr(row.rupturePrevue) : '—'}</td>
                              <td className={stockStyles.sparklineCell}>
                                <Sparkline weekly={weekly} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {nonSuivis.length > 0 && (
                  <>
                    <h3 className={styles.zoneTitle}>Titres non suivis — non vendus en ligne</h3>
                    <p className={styles.muted}>
                      Stock non renseigné : retirés de la vente en ligne tant qu&apos;un stock
                      n&apos;est pas indiqué (import ou saisie manuelle).
                    </p>
                    <div className={styles.tableWrap}>
                      <table className={styles.dataTable}>
                        <thead>
                          <tr>
                            <th scope="col">Titre</th>
                            <th className={styles.right} scope="col">
                              Vendus 30 j
                            </th>
                            <th className={styles.right} scope="col">
                              Vélocité
                            </th>
                            <th scope="col">Ventes 8 semaines</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nonSuivis.map((row) => {
                            const weekly = bucketWeeklyQuantities(
                              byBook.get(row.id) ?? [],
                              now,
                              WEEKLY_BUCKETS,
                            )
                            return (
                              <tr key={row.id}>
                                <td>
                                  <span
                                    className={dotClass('na')}
                                    role="img"
                                    aria-label={dotLabel('na')}
                                  />{' '}
                                  <a href={`/admin/collections/books/${row.id}`}>{row.title}</a>{' '}
                                  <span className={styles.tag}>{editionTag(row.edition)}</span>
                                </td>
                                <td className={styles.right}>{row.vendus30j}</td>
                                <td className={styles.right}>{fmtVelocite(row.velociteJour)}</td>
                                <td className={stockStyles.sparklineCell}>
                                  <Sparkline weekly={weekly} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            {salesWindow.state === 'na' && (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                vélocité indisponible — ventes 30 j non calculables
              </Pill>
            )}

            {seuilInfo.seuilIllisible && (
              <span className={styles.noteChip}>
                seuil non lisible (réglages boutique) — marquage « stock bas » basé sur le défaut{' '}
                {STOCK_SEUIL_FALLBACK}
              </span>
            )}

            <span className={styles.noteChip}>
              Estimations fondées sur les ventes des 30 derniers jours. Le stock « routeur » peut dater
              du dernier import mensuel.
            </span>

            <div className={styles.actions}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
              <a href="/admin/globals/reglages-boutique">Modifier le seuil (admin) →</a>
            </div>
          </section>

          <section className={styles.panel} id="panneau-import" aria-labelledby="t-import">
            <h2 className={styles.panelTitle} id="t-import">
              <span className={dotClass(importState)} role="img" aria-label={dotLabel(importState)} />{' '}
              Import routeur
            </h2>
            {importRun.state === 'na' ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                historique des imports indisponible
              </Pill>
            ) : importRun.run === null ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                Aucun import enregistré
              </Pill>
            ) : (
              <>
                <div className={styles.bigRow}>
                  <span className={styles.big}>{importRun.run.nbMatchees}</span>
                  <span className={styles.target}>
                    lignes appariées / <strong>{importRun.run.nbLignes}</strong> traitées — dernier
                    import le {fmtDateTimeFr(importRun.run.createdAt)}
                  </span>
                </div>
                {importState === 'alert' && (
                  <Pill pillStyle={pillStyleForState('alert')} size="small">
                    dernier import il y a plus de {IMPORT_ALERT_DAYS} jours
                  </Pill>
                )}
                <div className={styles.actions}>
                  <a href={`/api/import-runs/${importRun.run.id}/rapport`}>
                    Télécharger le rapport des non-appariés
                    {importRun.run.nonApparies !== null ? ` (${importRun.run.nonApparies})` : ''} →
                  </a>
                </div>
              </>
            )}

            {admin && (
              <div>
                <h3 className={styles.shortcutHeading}>Importer un fichier routeur</h3>
                <StockImportForm />
                <span className={styles.kbdNote}>
                  Geste sensible : écrase des stocks existants (suivi routeur) — rôle admin.
                </span>
              </div>
            )}
          </section>

          <DashboardLegend />
        </div>
      </div>
    </DefaultTemplate>
  )
}
