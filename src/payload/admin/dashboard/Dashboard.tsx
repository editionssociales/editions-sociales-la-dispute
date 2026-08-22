import type { ServerProps } from 'payload'

import { Pill } from '@payloadcms/ui'

import {
  chartAxisTicks,
  dailySalesBuckets,
  editionTag,
  everyNthLabels,
  fmtDateFr,
  fmtDayMonthFr,
  fmtEuros,
  fmtEurosAxis,
  humanAge,
  rollingWindows,
  salesChartGeometry,
  salesStats,
  summarizeLines,
  urgentStockRows,
} from './derive.ts'
import { pillStyleForState } from './dashboard-classes.ts'
import {
  readActiveHighlightPanel,
  readNewsletterCount,
  readPendingPreorders,
  readPreorderTotals,
  readPromosOverview,
  readSalesWindow,
  readSouscriptionJauge,
  readStockOutlook,
  readUpcomingBooks,
  readUpcomingRencontres,
  readWorkOrders,
} from './data.ts'
import styles from './dashboard.module.css'
import { PromoDeactivateButton } from './PromoDeactivateButton.tsx'
import { upcomingBoundaryUtc } from '../../../lib/sellability.ts'
import { buildChartXLabels, SalesBarChart } from './SalesBarChart.tsx'

/**
 * Slot `beforeDashboard` du dashboard `/admin` (home — design v4, refonte
 * vague 2) : 5 zones dans un ordre vertical strict, jamais plus de 4 entrées
 * par panneau (+ lien « voir tout(e)s » quand il y en a davantage) :
 *
 *   1. Bandeau KPI (ventes 30 j glissants + newsletter) ;
 *   2. Graphique « Ventes par jour » (30 barres) ;
 *   3. Commandes à traiter (4 plus récentes + précommandes en attente) ;
 *   4. « En cours » : Codes promo · Campagne (mise en avant + jauge de dons,
 *      DEUX lignes distinctes, jamais fusionnées) · Prochaines parutions ·
 *      Prochaines rencontres · Stocks en tension ;
 *   5. Raccourcis.
 *
 * Règle d'état non négociable (partagée avec `../stock/StockPage.tsx` et
 * `../health/HealthPage.tsx`) : un panneau sans rien à montrer est MASQUÉ
 * (silence, pas de placeholder) ; un lecteur en état `na` (I/O en échec) ne
 * l'est JAMAIS — il s'affiche en gris « indisponible » (`<Pill>`,
 * `pillStyleForState('na')`), jamais masqué, jamais vert/zéro par défaut.
 * Plus de pastilles d'ancienneté ni de seuils de retard sur les commandes
 * (décision client) : la légende à 4 états (`Legend.tsx`) et les pastilles
 * `dotClass`/`dotLabel` (`dashboard-classes.ts`) ne sont donc plus montées
 * ici — elles restent utilisées par `/admin/stock` et `/admin/sante`.
 *
 * `readSalesWindow(payload, now)` est LA seule lecture des ventes (60 j) de
 * toute la page : le bandeau KPI, le graphique, le bloc « Prochaines
 * parutions » (précommandes payées, fenêtre 30 j de repli) et « Stocks en
 * tension » (vélocité) partagent ce même résultat déjà résolu — jamais une
 * deuxième requête. C'est aussi la seule I/O hors du `Promise.all` commun :
 * `readUpcomingBooks`/`readStockOutlook` prennent la fenêtre déjà RÉSOLUE en
 * paramètre (pas une promesse), donc `readSalesWindow` doit être attendue
 * avant de pouvoir les lancer — le reste des lecteurs, indépendants les uns
 * des autres, part dans un seul `Promise.all`.
 *
 * RSC : lectures via `data.ts`, dérivations pures via `derive.ts`, un seul
 * îlot client (désactivation d'un code promo expiré, `PromoDeactivateButton`).
 */

const CHART_WIDTH = 720
const CHART_HEIGHT = 140
const CHART_TOP_PADDING = 18
const CHART_BAR_AREA_HEIGHT = 86
/** ~1 libellé/semaine sur les 30 barres quotidiennes (`everyNthLabels`, `derive.ts`). */
const CHART_X_LABEL_TARGET = 5

const ORDER_STATUS_LABELS: Record<string, string> = {
  paid: 'payée',
  prepared: 'préparée',
}

const SHIPPING_LABELS: Record<string, string> = {
  standard: 'standard',
  reduit: 'réduit',
  offert: 'offert',
}

export async function Dashboard({ payload }: ServerProps) {
  const now = new Date()

  // Lecture unique des ventes 60 j — voir le commentaire d'en-tête.
  const salesWindow = await readSalesWindow(payload, now)

  const [
    workOrders,
    pendingPreorders,
    promosOverview,
    highlightPanel,
    souscription,
    upcomingBooks,
    preorderTotals,
    rencontres,
    stockOutlook,
    newsletter,
  ] = await Promise.all([
    readWorkOrders(payload),
    readPendingPreorders(payload),
    readPromosOverview(payload, now),
    readActiveHighlightPanel(),
    readSouscriptionJauge(),
    readUpcomingBooks(payload, salesWindow, now),
    readPreorderTotals(payload),
    readUpcomingRencontres(payload, now),
    readStockOutlook(payload, salesWindow, now),
    readNewsletterCount(),
  ])

  const ventes = salesWindow.state === 'ok' ? salesStats(salesWindow.rows, now) : null
  const dailyBuckets = salesWindow.state === 'ok' ? dailySalesBuckets(salesWindow.rows, now) : null
  const chartMax = dailyBuckets ? Math.max(0, ...dailyBuckets.map((b) => b.ca)) : 0
  // Grille/barres à la même échelle (`axisMax`, jamais le maximum brut de la
  // série) — cf. le commentaire de `salesChartGeometry` (`derive.ts`).
  const chartAxis = chartAxisTicks(chartMax)
  const chartBars = dailyBuckets
    ? salesChartGeometry(dailyBuckets, { width: CHART_WIDTH, height: CHART_BAR_AREA_HEIGHT }, chartAxis.axisMax)
    : []
  const chartFirstDay = dailyBuckets?.[0]?.day ?? null
  const chartLastDay = dailyBuckets?.[dailyBuckets.length - 1]?.day ?? null
  const chartTicks = chartAxis.ticks.map((value) => ({ value, label: fmtEurosAxis(value) }))
  const chartLabelIndices = dailyBuckets
    ? everyNthLabels(
        dailyBuckets.map((b) => b.day),
        CHART_X_LABEL_TARGET,
      )
    : []
  const chartXLabels = dailyBuckets
    ? buildChartXLabels(chartBars, chartLabelIndices, CHART_WIDTH, (i) => fmtDayMonthFr(dailyBuckets[i].day))
    : []
  // Détail au survol par barre — « 12 août — 148,50 € » (jour + mois SANS
  // année, réutilisé tel quel par `../ventes/VentesPage.tsx`, cf. `derive.ts`).
  const chartDetails = new Map(
    (dailyBuckets ?? []).map((b) => [b.day, `${fmtDayMonthFr(b.day)} — ${fmtEuros(b.ca)}`]),
  )

  // Carte KPI ventes → liste des commandes filtrée sur la même borne 30 j
  // (dons exclus, même étanchéité comptable que `salesStats`), motif hérité
  // de l'ancien `monthSalesHref`.
  const salesHref = `/admin/collections/orders?where[or][0][and][0][paidAt][greater_than_equal]=${encodeURIComponent(
    rollingWindows(now).start30.toISOString(),
  )}&where[or][0][and][1][orderType][not_equals]=don`

  const urgentStock = stockOutlook.state === 'ok' ? urgentStockRows(stockOutlook.rows).slice(0, 4) : []

  return (
    <div className={styles.board}>
      {/* ── 1. Bandeau KPI ── */}
      <div className={styles.kpiRow}>
        <a
          className={`${styles.kpiCard} ${styles.kpiCardPrimary}`}
          href={salesHref}
          aria-label="Ventes des 30 derniers jours — voir les commandes correspondantes"
        >
          <span className={styles.kpiLabel}>Ventes — 30 derniers jours</span>
          {ventes === null ? (
            <Pill pillStyle={pillStyleForState('na')} size="small">
              indisponible
            </Pill>
          ) : (
            <>
              <span className={styles.kpiAmount}>{fmtEuros(ventes.ca)}</span>
              <span className={styles.kpiMeta}>
                {ventes.nbCommandes} commande{ventes.nbCommandes > 1 ? 's' : ''} ·{' '}
                {ventes.nbExemplaires} exemplaire{ventes.nbExemplaires > 1 ? 's' : ''}
              </span>
              {ventes.caPrecommande > 0 && (
                <span className={styles.kpiMeta}>dont {fmtEuros(ventes.caPrecommande)} de précommandes</span>
              )}
              {ventes.deltaPct !== null && (
                <span className={styles.kpiDelta}>
                  {ventes.deltaPct >= 0 ? '+' : ''}
                  {Math.round(ventes.deltaPct)} % vs 30 j précédents
                </span>
              )}
            </>
          )}
        </a>

        <div className={`${styles.kpiCard} ${styles.kpiCardSecondary}`} aria-label="Newsletter">
          <span className={styles.kpiLabel}>Newsletter</span>
          {newsletter.state === 'na' ? (
            <Pill pillStyle={pillStyleForState('na')} size="small">
              indisponible
            </Pill>
          ) : (
            <span className={styles.kpiAmountSmall}>{newsletter.totalSubscribers} inscrit·e·s</span>
          )}
          <a className={styles.kpiExternalLink} href="https://app.brevo.com" target="_blank" rel="noreferrer">
            Gérer dans Brevo →
          </a>
        </div>
      </div>

      {/* ── 2. Graphique ventes ── */}
      <section className={styles.panel} aria-labelledby="t-ventes-jour">
        <h3 className={styles.panelTitle} id="t-ventes-jour">
          Ventes par jour
        </h3>
        {dailyBuckets === null ? (
          <Pill pillStyle={pillStyleForState('na')} size="small">
            indisponible
          </Pill>
        ) : (
          <SalesBarChart
            bars={chartBars.map((bar) => ({ x: bar.x, y: bar.y, w: bar.w, h: bar.h, key: bar.day }))}
            dims={{
              width: CHART_WIDTH,
              height: CHART_HEIGHT,
              topPadding: CHART_TOP_PADDING,
              barAreaHeight: CHART_BAR_AREA_HEIGHT,
            }}
            ticks={chartTicks}
            axisMax={chartAxis.axisMax}
            xLabels={chartXLabels}
            details={chartDetails}
            ariaLabel={`Ventes par jour, du ${fmtDateFr(chartFirstDay ?? '')} au ${fmtDateFr(
              chartLastDay ?? '',
            )}, maximum ${fmtEuros(chartMax)}`}
          />
        )}
        <div className={styles.actions}>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
          <a href="/admin/ventes">Détail des ventes →</a>
        </div>
      </section>

      {/* ── 3. Commandes à traiter ── */}
      <section className={styles.panel} id="panneau-commandes" aria-labelledby="t-commandes">
        <h3 className={styles.panelTitle} id="t-commandes">
          Commandes à traiter{workOrders.state === 'ok' ? ` (${workOrders.totalPending})` : ''}
        </h3>
        {workOrders.state === 'na' ? (
          <Pill pillStyle={pillStyleForState('na')} size="small">
            liste des commandes indisponible
          </Pill>
        ) : workOrders.orders.length === 0 ? (
          <p className={styles.empty}>Aucune commande en attente.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contenu</th>
                  <th>Quand</th>
                  <th className={styles.right}>Montant</th>
                  <th>Envoi</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.orders.map((order) => (
                  <tr key={order.id} className={styles.rowExpandable}>
                    <td>
                      {/* Lien étendu : le `::after` de ce lien couvre tout le
                          `<tr>` (`.rowExpandable`, `position: relative`) — la
                          ligne entière est cliquable sans JS. */}
                      <a className={styles.rowLink} href={`/admin/collections/orders/${order.id}`}>
                        {order.fullName}
                      </a>
                      <span className={styles.rowSubtle}>{order.number}</span>
                    </td>
                    <td>{summarizeLines(order.lines)}</td>
                    <td>
                      {humanAge(order.paidAt ?? order.createdAt, now)}{' '}
                      <span className={styles.tag}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
                    </td>
                    <td className={styles.right}>{fmtEuros(order.totalTTC)}</td>
                    <td>{SHIPPING_LABELS[order.shippingMethod] ?? order.shippingMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.actions}>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
          <a href="/admin/collections/orders">Voir toutes les commandes →</a>
          {workOrders.state === 'ok' && workOrders.totalPending > workOrders.orders.length && (
            <span className={styles.kpiMeta}>
              + {workOrders.totalPending - workOrders.orders.length} autres commandes
            </span>
          )}
        </div>
        {pendingPreorders.state === 'na' ? (
          <Pill pillStyle={pillStyleForState('na')} size="small">
            précommandes en attente : indisponible
          </Pill>
        ) : (
          pendingPreorders.count > 0 && (
            <p className={styles.empty}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
              <a href="/admin/collections/orders?where[orderType][equals]=precommande">
                {pendingPreorders.count} précommande{pendingPreorders.count > 1 ? 's' : ''} en attente de
                parution →
              </a>
            </p>
          )
        )}
      </section>

      {/* ── 4. En cours ── */}
      <div className={styles.zone} aria-label="En cours">
        <h2 className={styles.zoneTitle}>En cours</h2>

        {/* Codes promo */}
        {(promosOverview.state === 'na' ||
          promosOverview.live.length > 0 ||
          promosOverview.expiredActive.length > 0) && (
          <section className={styles.panel} aria-labelledby="t-promos">
            <h3 className={styles.subBlockTitle} id="t-promos">
              Codes promo
            </h3>
            {promosOverview.state === 'na' ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                indisponible
              </Pill>
            ) : (
              <div className={styles.configList}>
                {promosOverview.live.map((promo) => (
                  <div key={promo.id} className={styles.configRow}>
                    <a href={`/admin/collections/promo-codes/${promo.id}`}>{promo.code}</a>
                    <span>{promo.label}</span>
                    <span>
                      {promo.expiresAt ? `expire le ${fmtDateFr(promo.expiresAt)}` : 'sans expiration'}
                    </span>
                    <span>utilisé {promo.usage} fois</span>
                  </div>
                ))}
                {promosOverview.expiredActive.map((promo) => (
                  <div key={promo.id} className={styles.configRow}>
                    <a href={`/admin/collections/promo-codes/${promo.id}`}>{promo.code}</a>
                    <span className={styles.alertText}>
                      expiré le {fmtDateFr(promo.expiresAt ?? '')}, encore <strong>actif</strong>
                    </span>
                    <PromoDeactivateButton id={promo.id} />
                  </div>
                ))}
              </div>
            )}
            {promosOverview.state === 'ok' && promosOverview.totalLive > 4 && (
              <div className={styles.actions}>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
                <a href="/admin/collections/promo-codes">voir tous →</a>
              </div>
            )}
          </section>
        )}

        {/* Campagne — mise en avant et jauge de dons : deux systèmes, deux lignes, jamais fusionnées */}
        <section className={styles.panel} aria-labelledby="t-campagne">
          <h3 className={styles.subBlockTitle} id="t-campagne">
            Campagne
          </h3>
          {highlightPanel.state === 'na' ? (
            <Pill pillStyle={pillStyleForState('na')} size="small">
              mise en avant : indisponible
            </Pill>
          ) : (
            highlightPanel.highlight && (
              <p className={styles.entryRow}>
                <a href={`/admin/collections/highlight/${highlightPanel.highlight.id}`}>
                  {highlightPanel.highlight.titre}
                </a>
                <span className={styles.kpiMeta}>
                  du {fmtDateFr(highlightPanel.highlight.dateDebut)} au{' '}
                  {fmtDateFr(highlightPanel.highlight.dateFin)}
                </span>
              </p>
            )
          )}
          {souscription.state === 'na' ? (
            <Pill pillStyle={pillStyleForState('na')} size="small">
              souscription : indisponible
            </Pill>
          ) : (
            <div>
              <p className={styles.entryRow}>
                {fmtEuros(souscription.total)} collectés / objectif {fmtEuros(souscription.objectif)} (
                {souscription.pourcentage} %)
              </p>
              <div className={styles.gaugeTrack}>
                <div
                  className={styles.gaugeFill}
                  style={{ width: `${Math.min(100, Math.max(0, souscription.pourcentage))}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Prochaines parutions */}
        {(upcomingBooks.state === 'na' || upcomingBooks.books.length > 0) && (
          <section className={styles.panel} aria-labelledby="t-parutions">
            <h3 className={styles.subBlockTitle} id="t-parutions">
              Prochaines parutions
            </h3>
            {upcomingBooks.state === 'na' ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                indisponible
              </Pill>
            ) : (
              <div className={styles.configList}>
                {upcomingBooks.books.map((book) => {
                  // `readPreorderTotals` (total vie entière) prime sur le
                  // compteur fenêtré 30 j de `readUpcomingBooks` — repli sur
                  // ce dernier (déjà zéro-safe) si le lecteur vie entière est
                  // `na`, jamais un zéro inventé.
                  const precommandesPayees =
                    preorderTotals.state === 'ok'
                      ? (preorderTotals.totalByBook.get(book.id) ?? 0)
                      : book.precommandesPayees
                  return (
                    <div key={book.id} className={styles.configRow}>
                      <a href={`/admin/collections/books/${book.id}`}>{book.title}</a>
                      <span className={styles.tag}>{editionTag(book.edition)}</span>
                      <span className={styles.kpiMeta}>{fmtDateFr(book.dateParution)}</span>
                      {book.preorder && <span className={styles.tag}>précommande ouverte</span>}
                      {precommandesPayees > 0 && (
                        <span className={styles.kpiMeta}>
                          {precommandesPayees} précommande{precommandesPayees > 1 ? 's' : ''} payée
                          {precommandesPayees > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {upcomingBooks.state === 'ok' && upcomingBooks.totalDocs > 4 && (
              <div className={styles.actions}>
                <a
                  href={`/admin/collections/books?where[or][0][and][0][dateParution][greater_than_equal]=${encodeURIComponent(upcomingBoundaryUtc())}`}
                >
                  voir tous →
                </a>
              </div>
            )}
          </section>
        )}

        {/* Prochaines rencontres */}
        {(rencontres.state === 'na' || rencontres.rencontres.length > 0) && (
          <section className={styles.panel} aria-labelledby="t-rencontres">
            <h3 className={styles.subBlockTitle} id="t-rencontres">
              Prochaines rencontres
            </h3>
            {rencontres.state === 'na' ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                indisponible
              </Pill>
            ) : (
              <div className={styles.configList}>
                {rencontres.rencontres.map((rencontre) => (
                  <div key={rencontre.id} className={styles.configRow}>
                    <a href={`/admin/collections/rencontres/${rencontre.id}`}>{rencontre.titre}</a>
                    <span className={styles.kpiMeta}>{fmtDateFr(rencontre.date)}</span>
                    <span className={styles.kpiMeta}>{rencontre.ville}</span>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.actions}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
              <a href="/admin/collections/rencontres">voir toutes →</a>
            </div>
          </section>
        )}

        {/* Stocks en tension */}
        {(stockOutlook.state === 'na' || urgentStock.length > 0) && (
          <section className={styles.panel} aria-labelledby="t-stock-tension">
            <h3 className={styles.subBlockTitle} id="t-stock-tension">
              Stocks en tension
            </h3>
            {stockOutlook.state === 'na' ? (
              <Pill pillStyle={pillStyleForState('na')} size="small">
                indisponible
              </Pill>
            ) : (
              <>
                <div className={styles.configList}>
                  {urgentStock.map((row) => (
                    <div key={row.id} className={styles.configRow}>
                      <a href={`/admin/collections/books/${row.id}`}>{row.title}</a>
                      <span className={styles.kpiMeta}>
                        {row.stock !== null && row.stock <= 0 ? 'épuisé' : `stock ${row.stock}`}
                      </span>
                      {row.joursRestants !== null && (
                        <span className={styles.kpiMeta}>~{row.joursRestants} j restants</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className={styles.actions}>
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
                  <a href="/admin/stock">Évolution du stock →</a>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* ── 5. Raccourcis ── */}
      <div className={styles.zone} aria-label="Raccourcis">
        <h2 className={styles.zoneTitle} id="t-raccourcis">
          Raccourcis
        </h2>
        <section className={styles.panel} aria-labelledby="t-raccourcis">
          <div className={styles.shortcutLinks}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a className={styles.createButton} href="/admin/collections/books/create">
              + Nouveau livre
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a className={styles.createButton} href="/admin/collections/libelles/create">
              + Nouveau libellé
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a className={styles.createButton} href="/admin/collections/highlight/create">
              + Nouvelle mise en avant
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a className={styles.createButton} href="/admin/collections/rencontres/create">
              + Nouvelle rencontre
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a className={styles.createButton} href="/admin/collections/promo-codes/create">
              + Nouveau code promo
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a className={styles.shortcutLink} href="/admin/collections/orders">
              Commandes
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a className={styles.shortcutLink} href="/admin/stock">
              Stock
            </a>
          </div>

          <div className={styles.secondaryLinks}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a href="/admin/collections/orders?where[or][0][and][0][status][equals]=refunded">
              Remboursements
            </a>
            <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
              Dons (Stripe)
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
