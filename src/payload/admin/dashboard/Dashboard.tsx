import type { ServerProps } from 'payload'

import {
  bannerHidden,
  commandesState as deriveCommandesState,
  editionTag,
  fmtDateFr,
  fmtDateTimeFr,
  fmtEuros,
  IMPORT_ALERT_DAYS,
  importSignal,
  ORDER_ALERT_HOURS,
  ORDER_WARN_HOURS,
  orderLateness,
  parisMonthBounds,
  pastilleText,
  STOCK_SEUIL_FALLBACK,
  stockRowState,
  stockSignal,
  worstState,
  type BannerItem,
  type PanelState,
} from './derive.ts'
import { badgeClass, bannerStateClass, dotClass } from './dashboard-classes.ts'
import { readExpiredPromos, readLastImportRun, readLowStock, readWorkOrders } from './data.ts'
import styles from './dashboard.module.css'
import { DashboardLegend } from './Legend.tsx'
import { OrderExportForm } from './OrderExportForm.tsx'
import { PromoDeactivateButton } from './PromoDeactivateButton.tsx'
import { StockImportForm } from './StockImportForm.tsx'

/**
 * Slot `beforeDashboard` du dashboard `/admin` v3 (home = 3 zones, issue
 * #23) : bandeau d'état (3.1) puis zone A « File du jour » (toujours
 * visible), zone B « Alertes » (rendue seulement si au moins une alerte),
 * zone C « Raccourcis » (toujours visible). La grille native
 * `CollectionCards` reste rendue par Payload SOUS ce composant (masquée en
 * CSS, `custom.scss` — nav groupée, issue #25) ; 3.12/3.13
 * vivent toujours dans `DashboardFooter` (`afterDashboard`, admin seul,
 * inchangé par ce lot).
 *
 * RSC : lectures via `data.ts` (chaque lecteur dégrade en `na`, ce composant
 * ne plante jamais), dérivations pures via `derive.ts`, trois îlots client
 * seulement (upload d'import, désactivation promo, export).
 */

const ORDER_STATUS_LABELS: Record<string, string> = {
  paid: 'payée',
  prepared: 'préparée',
}

const SHIPPING_LABELS: Record<string, string> = {
  standard: 'standard',
  reduit: 'réduit',
  offert: 'offert',
}

export async function Dashboard({ payload, user }: ServerProps) {
  const admin = user?.role === 'admin'
  const now = new Date()

  const [workOrders, lowStock, importRun, expiredPromos] = await Promise.all([
    readWorkOrders(payload),
    readLowStock(payload),
    readLastImportRun(payload),
    readExpiredPromos(payload, now),
  ])

  /* ── Signaux (mêmes données que les panneaux — le bandeau n'a aucun fetch propre) ── */

  const commandesState: PanelState = deriveCommandesState(workOrders, now)

  const stockState: PanelState =
    lowStock.state === 'na' ? 'na' : stockSignal(lowStock.rows.map((row) => row.stock))

  const importState: PanelState =
    importRun.state === 'na' ? 'na' : importSignal(importRun.run?.createdAt ?? null, now)

  /* ── Zone B « Alertes » — chaque sous-panneau ne rend que s'il a quelque chose à dire ── */

  const stockPanel =
    lowStock.state === 'ok' && (lowStock.rows.length > 0 || lowStock.seuilIllisible) ? lowStock : null
  const importPanelVisible = admin && importState !== 'ok'
  const promosPanel =
    expiredPromos.state === 'ok' && expiredPromos.promos.length > 0 ? expiredPromos : null
  const hasAlerts = stockPanel !== null || importPanelVisible || promosPanel !== null

  /* ── Raccourci « Ventes du mois » (zone C) — lien seul, aucune lecture dédiée ── */

  const monthBounds = parisMonthBounds(now)
  const monthSalesHref = `/admin/collections/orders?where[or][0][and][0][paidAt][greater_than_equal]=${encodeURIComponent(monthBounds.start.toISOString())}&where[or][0][and][1][paidAt][less_than]=${encodeURIComponent(monthBounds.end.toISOString())}`

  /* ── Bandeau (3.1) — 3 pastilles max, ancre seulement si le panneau ciblé sera bien rendu ── */

  const bannerItems: BannerItem[] = [
    { key: 'commandes', label: 'Commandes', state: commandesState, anchor: '#panneau-commandes' },
    { key: 'stock', label: 'Stock', state: stockState, anchor: stockPanel ? '#panneau-stock' : null },
  ]
  if (admin) {
    bannerItems.push({
      key: 'import',
      label: 'Import',
      state: importState,
      anchor: importPanelVisible ? '#panneau-import' : null,
    })
  }
  const bannerWorst = worstState(bannerItems.map((item) => item.state))
  const bannerClass = bannerStateClass(bannerWorst)

  return (
    <div className={styles.board}>
      {/* ── 3.1 Bandeau d'état — masqué intégralement si tout est vert ── */}
      {!bannerHidden(bannerItems) && (
        <section className={`${styles.banner} ${bannerClass}`} aria-label="État du site">
          <span className={styles.bannerTitle}>État du site</span>
          <span className={styles.pastilles}>
            {bannerItems.map((item) => (
              <span key={item.key} className={styles.pastille}>
                <span className={dotClass(item.state)} />
                {item.anchor && item.state !== 'ok' ? (
                  <a href={item.anchor}>{pastilleText(item)}</a>
                ) : (
                  pastilleText(item)
                )}
              </span>
            ))}
          </span>
        </section>
      )}

      {/* ── Zone A « File du jour » — toujours visible ── */}
      <div className={styles.zone} aria-label="File du jour">
        <h2 className={styles.zoneTitle}>File du jour</h2>
        <section className={styles.panel} id="panneau-commandes" aria-labelledby="t-commandes">
          <h3 className={styles.panelTitle} id="t-commandes">
            <span className={dotClass(commandesState)} /> Commandes à traiter
          </h3>
          {workOrders.state === 'na' ? (
            <span className={badgeClass('na')}>liste des commandes indisponible</span>
          ) : workOrders.orders.length === 0 ? (
            <p className={styles.empty}>Aucune commande en attente.</p>
          ) : (
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Statut</th>
                  <th>Le</th>
                  <th className={styles.right}>Lignes</th>
                  <th className={styles.right}>Total</th>
                  <th>Port</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <span className={dotClass(orderLateness(order, now))} />{' '}
                      <a href={`/admin/collections/orders/${order.id}`}>{order.number}</a>
                    </td>
                    <td>
                      <span className={styles.tag}>
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td>{fmtDateTimeFr(order.paidAt ?? order.createdAt)}</td>
                    <td className={styles.right}>{order.linesCount}</td>
                    <td className={styles.right}>{fmtEuros(order.totalTTC)}</td>
                    <td>{SHIPPING_LABELS[order.shippingMethod] ?? order.shippingMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <span className={styles.noteChip}>
            retard {ORDER_WARN_HOURS} h (attention) / {ORDER_ALERT_HOURS} h (alerte) — seuils
            provisoires, à valider avec le client
          </span>
          <div className={styles.actions}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a href="/admin/collections/orders">Voir toutes les commandes →</a>
          </div>
        </section>
      </div>

      {/* ── Zone B « Alertes » — rendue seulement si au moins une alerte (décision #22) ── */}
      {hasAlerts && (
        <div className={styles.zone} aria-label="Alertes">
          <h2 className={styles.zoneTitle}>Alertes</h2>

          {stockPanel && (
            <section className={styles.panel} id="panneau-stock" aria-labelledby="t-stock">
              <h3 className={styles.panelTitle} id="t-stock">
                <span className={dotClass(stockState)} /> Stock bas
              </h3>
              <div className={styles.bigRow}>
                <span className={styles.big}>{stockPanel.rows.length}</span>
                <span className={styles.target}>
                  titre(s) sous le seuil (seuil actuel : <strong>{stockPanel.seuil}</strong>)
                </span>
              </div>
              {stockPanel.seuilIllisible && (
                <span className={styles.noteChip}>
                  seuil non lisible (réglages boutique) — alerte basée sur le défaut{' '}
                  {STOCK_SEUIL_FALLBACK}
                </span>
              )}
              {stockPanel.rows.length > 0 && (
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th className={styles.right}>Stock</th>
                      <th className={styles.right}>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockPanel.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <a href={`/admin/collections/books/${row.id}`}>{row.title}</a>{' '}
                          <span className={styles.tag}>{editionTag(row.edition)}</span>
                        </td>
                        <td className={styles.right}>{row.stock}</td>
                        <td className={styles.right}>
                          <span className={badgeClass(stockRowState(row.stock))}>
                            {row.stock <= 0 ? 'indisponible en ligne' : 'stock bas'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className={styles.actions}>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
                <a href="/admin/globals/reglages-boutique">Modifier le seuil (admin) →</a>
              </div>
            </section>
          )}

          {importPanelVisible && (
            <section className={styles.panel} id="panneau-import" aria-labelledby="t-import">
              <h3 className={styles.panelTitle} id="t-import">
                <span className={dotClass(importState)} /> Import routeur (stock)
              </h3>
              {importRun.state === 'na' ? (
                <span className={badgeClass('na')}>historique des imports indisponible</span>
              ) : importRun.run === null ? (
                <span className={badgeClass('na')}>Aucun import enregistré</span>
              ) : (
                <>
                  <div className={styles.bigRow}>
                    <span className={styles.big}>{importRun.run.nbMatchees}</span>
                    <span className={styles.target}>
                      lignes appariées / <strong>{importRun.run.nbLignes}</strong> traitées —
                      dernier import le {fmtDateTimeFr(importRun.run.createdAt)}
                    </span>
                  </div>
                  {importState === 'alert' && (
                    <span className={badgeClass('alert')}>
                      dernier import il y a plus de {IMPORT_ALERT_DAYS} jours
                    </span>
                  )}
                  <div className={styles.actions}>
                    <a href={`/api/import-runs/${importRun.run.id}/rapport`}>
                      Télécharger le rapport des non-appariés
                      {importRun.run.nonApparies !== null ? ` (${importRun.run.nonApparies})` : ''} →
                    </a>
                  </div>
                </>
              )}
            </section>
          )}

          {promosPanel && (
            <section className={styles.panel} aria-labelledby="t-promos">
              <h3 className={styles.panelTitle} id="t-promos">
                Codes promo expirés encore actifs
              </h3>
              <div className={styles.configList}>
                {promosPanel.promos.map((promo) => (
                  <div key={promo.id} className={styles.configRow}>
                    <span className={dotClass('warn')} />
                    <a href={`/admin/collections/promo-codes/${promo.id}`}>{promo.code}</a> — expiré
                    le {fmtDateFr(promo.expiresAt)}, encore <span className={styles.tag}>actif</span>
                    <PromoDeactivateButton id={promo.id} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Zone C « Raccourcis » — toujours visible ── */}
      <div className={styles.zone} aria-label="Raccourcis">
        <h2 className={styles.zoneTitle} id="t-raccourcis">
          Raccourcis
        </h2>
        <section className={styles.panel} aria-labelledby="t-raccourcis">
          <div className={styles.shortcutLinks}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a className={styles.shortcutLink} href="/admin/collections/books/create">
              + Nouveau livre
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a className={styles.shortcutLink} href="/admin/collections/books">
              Catalogue
            </a>
          </div>

          <div>
            <h4 className={styles.shortcutHeading}>Export compta / préparation</h4>
            <OrderExportForm />
          </div>

          {admin && (
            <div>
              <h4 className={styles.shortcutHeading}>Import stock (routeur)</h4>
              <StockImportForm />
            </div>
          )}

          <div className={styles.secondaryLinks}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
            <a href="/admin/collections/orders?where[or][0][and][0][status][equals]=refunded">
              Remboursements
            </a>
            <a href={monthSalesHref}>Ventes du mois</a>
            <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
              Dons (Stripe)
            </a>
          </div>

          <span className={styles.kbdNote}>
            {admin
              ? 'Export : bornes vides = toutes les commandes · Import stock : geste sensible, écrase des données existantes (rôle admin).'
              : 'Export : bornes vides = toutes les commandes.'}
          </span>
        </section>
      </div>

      <DashboardLegend />
    </div>
  )
}
