import type { ServerProps } from 'payload'

import { Pill } from '@payloadcms/ui'

import {
  commandesState as deriveCommandesState,
  fmtDateFr,
  fmtDateTimeFr,
  fmtEuros,
  ORDER_ALERT_HOURS,
  ORDER_WARN_HOURS,
  orderLateness,
  parisMonthBounds,
  type PanelState,
} from './derive.ts'
import { dotClass, dotLabel, pillStyleForState } from './dashboard-classes.ts'
import { readExpiredPromos, readWorkOrders } from './data.ts'
import styles from './dashboard.module.css'
import { DashboardLegend } from './Legend.tsx'
import { PromoDeactivateButton } from './PromoDeactivateButton.tsx'

/**
 * Slot `beforeDashboard` du dashboard `/admin` (home allégée) : zone A
 * « File du jour », zone B « Alertes » (promos expirées seulement), zone C
 * « Raccourcis ». Stock / import → `/admin/stock` ; observabilité →
 * `/admin/sante` (admin). Export CSV sur la liste commandes. Plus de bandeau
 * d'état. Grille native `CollectionCards` toujours masquée (`custom.scss`).
 *
 * RSC : lectures via `data.ts`, dérivations pures via `derive.ts`, un îlot
 * client (désactivation promo).
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

export async function Dashboard({ payload }: ServerProps) {
  const now = new Date()

  const [workOrders, expiredPromos] = await Promise.all([
    readWorkOrders(payload),
    readExpiredPromos(payload, now),
  ])

  const commandesState: PanelState = deriveCommandesState(workOrders, now)

  const promosPanel =
    expiredPromos.state === 'ok' && expiredPromos.promos.length > 0 ? expiredPromos : null

  const monthBounds = parisMonthBounds(now)
  const monthSalesHref = `/admin/collections/orders?where[or][0][and][0][paidAt][greater_than_equal]=${encodeURIComponent(monthBounds.start.toISOString())}&where[or][0][and][1][paidAt][less_than]=${encodeURIComponent(monthBounds.end.toISOString())}`

  return (
    <div className={styles.board}>
      {/* ── Zone A « File du jour » — toujours visible ── */}
      <div className={styles.zone} aria-label="File du jour">
        <h2 className={styles.zoneTitle}>File du jour</h2>
        <section className={styles.panel} id="panneau-commandes" aria-labelledby="t-commandes">
          <h3 className={styles.panelTitle} id="t-commandes">
            <span className={dotClass(commandesState)} role="img" aria-label={dotLabel(commandesState)} />{' '}
            Commandes à traiter
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
                        <span
                          className={dotClass(orderLateness(order, now))}
                          role="img"
                          aria-label={dotLabel(orderLateness(order, now))}
                        />{' '}
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
            </div>
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

      {/* ── Zone B « Alertes » — promos seulement (stock → /admin/stock) ── */}
      {promosPanel && (
        <div className={styles.zone} aria-label="Alertes">
          <h2 className={styles.zoneTitle}>Alertes</h2>
          <section className={styles.panel} aria-labelledby="t-promos">
            <h3 className={styles.panelTitle} id="t-promos">
              Codes promo expirés encore actifs
            </h3>
            <div className={styles.configList}>
              {promosPanel.promos.map((promo) => (
                <div key={promo.id} className={styles.configRow}>
                  <span className={dotClass('warn')} />
                  <a href={`/admin/collections/promo-codes/${promo.id}`}>{promo.code}</a> — expiré le{' '}
                  {fmtDateFr(promo.expiresAt)}, encore <span className={styles.tag}>actif</span>
                  <PromoDeactivateButton id={promo.id} />
                </div>
              ))}
            </div>
          </section>
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
            <a href={monthSalesHref}>Ventes du mois</a>
            <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
              Dons (Stripe)
            </a>
          </div>
        </section>
      </div>

      <DashboardLegend />
    </div>
  )
}
