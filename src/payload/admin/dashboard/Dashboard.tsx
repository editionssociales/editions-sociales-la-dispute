import type { ServerProps } from 'payload'

import { isCommerceNative } from '@/lib/env'

import {
  bannerHidden,
  donationsSignal,
  editionTag,
  fmtDateFr,
  fmtDateTimeFr,
  fmtEuros,
  IMPORT_ALERT_DAYS,
  importSignal,
  ORDER_ALERT_HOURS,
  ORDER_WARN_HOURS,
  orderLateness,
  pastilleText,
  sentrySignal,
  STOCK_SEUIL_FALLBACK,
  stockRowState,
  stockSignal,
  worstState,
  type BannerItem,
  type PanelState,
} from './derive.ts'
import {
  readDonations,
  readEditorialCounts,
  readExpiredPromos,
  readLastImportRun,
  readLowStock,
  readMonthSales,
  readRecentBooks,
  readRefunds,
  readSentryIssues,
  readWorkOrders,
} from './data.ts'
import styles from './dashboard.module.css'
import { DashboardLegend } from './Legend.tsx'
import { OrderExportForm } from './OrderExportForm.tsx'
import { PromoDeactivateButton } from './PromoDeactivateButton.tsx'
import { StockImportForm } from './StockImportForm.tsx'

/**
 * Slot `beforeDashboard` du dashboard `/admin` v2
 * (`_specs/dashboard-admin/design-v2.md`) : bandeau d'état (3.1), panneaux
 * 3.2→3.10 et codes promo expirés (complément 3.11). La grille native
 * `CollectionCards` (3.11) reste rendue par Payload SOUS ce composant ;
 * 3.12/3.13 vivent dans `DashboardFooter` (`afterDashboard`, admin seul).
 *
 * RSC : lectures via `data.ts` (chaque lecteur dégrade en `na`, ce composant
 * ne plante jamais), dérivations pures via `derive.ts`, trois îlots client
 * seulement (upload d'import, désactivation promo, export).
 */

function dotClass(state: PanelState): string {
  const byState: Record<PanelState, string> = {
    ok: styles.dotOk,
    warn: styles.dotWarn,
    alert: styles.dotAlert,
    na: styles.dotNa,
  }
  return `${styles.dot} ${byState[state]}`
}

function badgeClass(state: PanelState): string {
  const byState: Record<PanelState, string> = {
    ok: styles.badgeOk,
    warn: styles.badgeWarn,
    alert: styles.badgeAlert,
    na: styles.badgeNa,
  }
  return `${styles.badge} ${byState[state]}`
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  paid: 'payée',
  prepared: 'préparée',
}

const SHIPPING_LABELS: Record<string, string> = {
  standard: 'standard',
  reduit: 'réduit',
  offert: 'offert',
}

/** Note affichée sur les panneaux commerce tant que `COMMERCE_NATIVE` est à 0. */
const VENTE_FERMEE = 'Vente en ligne pas encore ouverte — ce panneau s’activera à la bascule.'

export async function Dashboard({ payload, user }: ServerProps) {
  const admin = user?.role === 'admin'
  const now = new Date()
  const commerceOn = isCommerceNative()

  const [workOrders, lowStock, refunds, monthSales, donations, importRun, editorial, recentBooks, expiredPromos, sentry] =
    await Promise.all([
      // Flag à 0 : pas de lecture commandes/CA — états vides/gris assumés
      // (jamais un « 0 € » trompeur), données réelles dès le flag à 1.
      commerceOn ? readWorkOrders(payload) : Promise.resolve(null),
      readLowStock(payload),
      commerceOn ? readRefunds(payload) : Promise.resolve(null),
      commerceOn ? readMonthSales(payload, now) : Promise.resolve(null),
      readDonations(now),
      readLastImportRun(payload),
      readEditorialCounts(payload),
      readRecentBooks(payload),
      readExpiredPromos(payload, now),
      readSentryIssues(),
    ])

  /* ── Signaux (mêmes données que les panneaux — le bandeau n'a aucun fetch propre) ── */

  const commandesState: PanelState = !commerceOn
    ? 'ok'
    : workOrders === null || workOrders.state === 'na'
      ? 'na'
      : worstState(workOrders.orders.map((order) => orderLateness(order, now)))

  const stockState: PanelState =
    lowStock.state === 'na' ? 'na' : stockSignal(lowStock.rows.map((row) => row.stock))

  const donsBase = donationsSignal({
    enabled: donations.mode !== 'absent',
    mode: donations.mode,
    gaugeAvailable: donations.gauge !== null,
    lastDonationAt: donations.lastDonationAt,
    refunds7d: donations.refunds7d ?? 0,
    now,
  })
  // Derniers dons ou remboursements illisibles : un « OK » serait un vert par
  // défaut — dégradé en gris ; une alerte/attention réelle reste prioritaire.
  const donsPartial =
    donations.mode !== 'absent' && (donations.recent === null || donations.refunds7d === null)
  const donsState: PanelState = donsPartial && donsBase === 'ok' ? 'na' : donsBase

  const importState: PanelState =
    importRun.state === 'na' ? 'na' : importSignal(importRun.run?.createdAt ?? null, now)

  const diagState: PanelState = sentrySignal(sentry.state === 'ok' ? sentry.errorEvents : null)

  /* ── Bandeau (3.1) — 5 pastilles pour tous, ancre seulement si le lecteur voit le panneau cible ── */

  const bannerItems: BannerItem[] = [
    { key: 'commandes', label: 'Commandes', state: commandesState, anchor: '#panneau-commandes' },
    { key: 'stock', label: 'Stock', state: stockState, anchor: '#panneau-stock' },
    { key: 'dons', label: 'Dons', state: donsState, anchor: '#panneau-dons' },
    { key: 'import', label: 'Import routeur', state: importState, anchor: admin ? '#panneau-import' : null },
    {
      key: 'diagnostic',
      label: 'Diagnostic technique',
      state: diagState,
      anchor: admin ? '#panneau-observabilite' : null,
    },
  ]
  const bannerWorst = worstState(bannerItems.map((item) => item.state))
  const bannerStateClass =
    bannerWorst === 'alert' ? styles.bannerAlert : bannerWorst === 'warn' ? styles.bannerWarn : ''

  return (
    <div className={styles.board}>
      {/* ── 3.1 Bandeau d'état — masqué intégralement si tout est vert ── */}
      {!bannerHidden(bannerItems) && (
        <section className={`${styles.banner} ${bannerStateClass}`} aria-label="État du site">
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

      {/* ── Rangée [3.2 | 3.3] — stock bas : 2ᵉ panneau de contenu, invariant y compris mobile (ordre DOM) ── */}
      <div className={styles.grid2}>
        <section className={styles.panel} id="panneau-commandes" aria-labelledby="t-commandes">
          <h3 className={styles.panelTitle} id="t-commandes">
            <span className={dotClass(commandesState)} /> Commandes à traiter
          </h3>
          {!commerceOn || workOrders === null ? (
            <>
              <p className={styles.empty}>Aucune commande en attente.</p>
              <span className={styles.noteChip}>{VENTE_FERMEE}</span>
            </>
          ) : workOrders.state === 'na' ? (
            <span className={badgeClass('na')}>liste des commandes indisponible</span>
          ) : (
            <>
              <div className={styles.bigRow}>
                <span className={styles.big}>{workOrders.orders.length}</span>
                <span className={styles.target}>commandes payées/préparées en attente</span>
              </div>
              <span className={styles.noteChip}>
                seuils {ORDER_WARN_HOURS} h (attention) / {ORDER_ALERT_HOURS} h (alerte) :
                provisoires, à valider avec le client
              </span>
              {workOrders.orders.length === 0 ? (
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
              <div className={styles.actions}>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
                <a href="/admin/collections/orders">Voir toutes les commandes →</a>
              </div>
            </>
          )}
          <span className={styles.freshness}>À la demande · rôles admin + éditeur·rice</span>
        </section>

        <section className={styles.panel} id="panneau-stock" aria-labelledby="t-stock">
          <h3 className={styles.panelTitle} id="t-stock">
            <span className={dotClass(stockState)} /> Stock bas — canal d’alerte
          </h3>
          {lowStock.state === 'na' ? (
            <span className={badgeClass('na')}>lecture du stock indisponible</span>
          ) : (
            <>
              <div className={styles.bigRow}>
                <span className={styles.big}>{lowStock.rows.length}</span>
                <span className={styles.target}>
                  titre(s) sous le seuil (seuil actuel : <strong>{lowStock.seuil}</strong>)
                </span>
              </div>
              {lowStock.seuilIllisible && (
                <span className={styles.noteChip}>
                  seuil non lisible (réglages boutique) — alerte basée sur le défaut{' '}
                  {STOCK_SEUIL_FALLBACK}, affiché tel quel
                </span>
              )}
              {lowStock.rows.length === 0 ? (
                // Le panneau ne se masque JAMAIS : l'état vide est la preuve
                // que le canal fonctionne (invariant du design, spec §3.3).
                <p className={styles.empty}>Aucun titre sous le seuil.</p>
              ) : (
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th className={styles.right}>Stock</th>
                      <th className={styles.right}>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.rows.map((row) => (
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
            </>
          )}
          <span className={styles.freshness}>
            À la demande, pas de cache long · lecture admin + éditeur·rice, seuil modifiable par
            l’admin
          </span>
        </section>
      </div>

      {/* ── Rangée [3.4 | 3.5] ── */}
      <div className={styles.grid2}>
        <section className={styles.panel} aria-labelledby="t-remboursements">
          <h3 className={styles.panelTitle} id="t-remboursements">
            Remboursements en attente de reflet
          </h3>
          <p className={styles.muted}>Aucune synchronisation automatique — vérifié dans Stripe d’abord.</p>
          {!commerceOn || refunds === null ? (
            <>
              <p className={styles.empty}>Aucune commande remboursée.</p>
              <span className={styles.noteChip}>{VENTE_FERMEE}</span>
            </>
          ) : refunds.state === 'na' ? (
            <span className={badgeClass('na')}>liste des remboursements indisponible</span>
          ) : refunds.refunds.length === 0 ? (
            <p className={styles.empty}>Aucune commande remboursée.</p>
          ) : (
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Email</th>
                  <th className={styles.right}>Montant</th>
                  <th className={styles.right}>Le</th>
                </tr>
              </thead>
              <tbody>
                {refunds.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td>
                      <a href={`/admin/collections/orders/${refund.id}`}>{refund.number}</a>
                    </td>
                    <td>{refund.email}</td>
                    <td className={styles.right}>{fmtEuros(refund.totalTTC)}</td>
                    <td className={styles.right}>{fmtDateFr(refund.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <span className={styles.kbdNote}>
            Pas de date ni de montant de remboursement dans le modèle (remboursement partiel non
            modélisé) — liste triée par date de commande.
          </span>
          <span className={styles.freshness}>À la demande · rôles admin + éditeur·rice</span>
        </section>

        <section className={styles.panel} aria-labelledby="t-ventes">
          <h3 className={styles.panelTitle} id="t-ventes">
            Ventes du mois
          </h3>
          {!commerceOn || monthSales === null ? (
            // JAMAIS « 0 € » tant que la vente n'est pas ouverte : panneau gris.
            <>
              <span className={badgeClass('na')}>chiffre indisponible</span>
              <span className={styles.noteChip}>{VENTE_FERMEE}</span>
            </>
          ) : monthSales.state === 'na' ? (
            <span className={badgeClass('na')}>chiffre indisponible (lecture en échec)</span>
          ) : (
            <>
              <div className={styles.bigRow}>
                <span className={styles.big}>{fmtEuros(monthSales.totalTTC)}</span>
                <span className={styles.target}>
                  CA brut · <strong>{monthSales.count}</strong> commande(s) en{' '}
                  {monthSales.monthLabel}
                </span>
              </div>
              <span className={styles.kbdNote}>
                CA brut — remboursements non déduits (décision « inclure les remboursements ? »
                encore ouverte).
              </span>
              <div className={styles.actions}>
                <a
                  href={`/admin/collections/orders?where[or][0][and][0][paidAt][greater_than_equal]=${encodeURIComponent(monthSales.start.toISOString())}&where[or][0][and][1][paidAt][less_than]=${encodeURIComponent(monthSales.end.toISOString())}`}
                >
                  Voir les commandes du mois →
                </a>
              </div>
            </>
          )}
          <span className={styles.freshness}>À la demande · rôles admin + éditeur·rice</span>
        </section>
      </div>

      {/* ── Rangée [3.6 | 3.7 (admin)] ── */}
      <div className={styles.grid2}>
        <section className={styles.panel} id="panneau-dons" aria-labelledby="t-dons">
          <h3 className={styles.panelTitle} id="t-dons">
            <span className={dotClass(donsState)} /> Campagne de dons 2026
          </h3>
          {donations.mode === 'absent' ? (
            <>
              <span className={badgeClass('alert')}>configuration des dons manquante</span>
              <p className={styles.muted}>
                Jauge indisponible — contacter le développeur (pas de 0 € trompeur).
              </p>
            </>
          ) : (
            <>
              {donations.gauge ? (
                <>
                  <div className={styles.bigRow}>
                    <span className={styles.big}>{fmtEuros(donations.gauge.collected)}</span>
                    <span className={styles.target}>
                      / {fmtEuros(donations.gauge.goal)} — {donations.gauge.percentOfGoal} % de
                      l’objectif
                    </span>
                  </div>
                  <div
                    className={styles.gauge}
                    role="img"
                    aria-label={`Jauge : ${donations.gauge.collected} euros sur ${donations.gauge.goal}`}
                  >
                    <span
                      className={styles.gaugeFill}
                      style={{ width: `${Math.min(100, donations.gauge.percentOfGoal)}%` }}
                    />
                  </div>
                </>
              ) : (
                <span className={badgeClass('na')}>jauge indisponible (lecture Stripe en échec)</span>
              )}
              <span className={badgeClass(donations.mode === 'test' ? 'warn' : 'ok')}>
                {donations.mode === 'test'
                  ? 'Paiement : mode test actif'
                  : 'Paiement : configuration correcte'}
              </span>
              {donations.recent === null ? (
                <p className={styles.muted}>Derniers dons indisponibles.</p>
              ) : donations.recent.length === 0 ? (
                <p className={styles.empty}>Aucun don encaissé pour l’instant.</p>
              ) : (
                <table className={styles.miniTable}>
                  <tbody>
                    {donations.recent.map((don) => (
                      <tr key={don.createdAt}>
                        <td>
                          Don de <strong>{fmtEuros(don.amountEur)}</strong>
                        </td>
                        <td>{fmtDateTimeFr(don.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className={styles.muted}>
                Remboursements (7 jours) :{' '}
                <strong>{donations.refunds7d === null ? 'indisponible' : donations.refunds7d}</strong>
              </p>
              <div className={styles.actions}>
                <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
                  Voir dans Stripe →
                </a>
              </div>
            </>
          )}
          <span className={styles.freshness}>
            Jauge actualisée ≤ 60 s · jamais de nom ni d’email affiché · rôles admin +
            éditeur·rice
          </span>
        </section>

        {admin && (
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
                    lignes appariées / <strong>{importRun.run.nbLignes}</strong> traitées, ISBN
                    normalisé
                  </span>
                </div>
                <span className={styles.freshness}>
                  Dernier import réussi : {fmtDateTimeFr(importRun.run.createdAt)}
                </span>
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
            <span className={styles.noteChip}>
              seuil d’alerte : {IMPORT_ALERT_DAYS} jours sans import réussi — provisoire, à valider
              avec le client
            </span>
            <StockImportForm />
            <span className={styles.freshness}>
              À la demande · rôle admin (geste sensible, écrase des données)
            </span>
          </section>
        )}
      </div>

      {/* ── 3.8 Travail éditorial ── */}
      <section className={styles.panel} aria-labelledby="t-travail">
        <h3 className={styles.panelTitle} id="t-travail">
          Travail éditorial en attente
        </h3>
        {editorial.state === 'na' ? (
          <span className={badgeClass('na')}>compteurs indisponibles</span>
        ) : (
          <div className={styles.tiles}>
            {[
              {
                n: editorial.aParaitre,
                lbl: 'à paraître',
                href: '/admin/collections/books?where[or][0][and][0][aParaitre][equals]=true',
              },
              {
                n: editorial.sansCouverture,
                lbl: 'sans couverture',
                href: '/admin/collections/books?where[or][0][and][0][cover][exists]=false',
              },
              {
                n: editorial.sansIsbn,
                lbl: 'sans ISBN',
                href: '/admin/collections/books?where[or][0][and][0][isbn][exists]=false&where[or][1][and][0][isbn][equals]=',
              },
              {
                n: editorial.sansPrix,
                lbl: 'sans prix',
                href: '/admin/collections/books?where[or][0][and][0][prix][exists]=false',
              },
            ].map((tile) => (
              <div key={tile.lbl} className={`${styles.tile} ${tile.n > 20 ? styles.tileWarn : ''}`}>
                <span className={styles.tileN}>{tile.n}</span>
                <span className={styles.tileLbl}>{tile.lbl}</span>
                <a href={tile.href}>voir →</a>
              </div>
            ))}
          </div>
        )}
        <span className={styles.freshness}>
          Chaque compteur ouvre la liste déjà filtrée · orange au-delà de 20 · rôles admin +
          éditeur·rice
        </span>
      </section>

      {/* ── 3.9 Quoi de neuf ── */}
      <section className={styles.panel} aria-labelledby="t-neuf">
        <h3 className={styles.panelTitle} id="t-neuf">
          Quoi de neuf
        </h3>
        {recentBooks.state === 'na' ? (
          <span className={badgeClass('na')}>liste indisponible</span>
        ) : recentBooks.books.length === 0 ? (
          <p className={styles.empty}>Aucune modification récente.</p>
        ) : (
          <table className={styles.dataTable}>
            <tbody>
              {recentBooks.books.map((book) => (
                <tr key={book.id}>
                  <td>
                    <a href={`/admin/collections/books/${book.id}`}>{book.title}</a>
                  </td>
                  <td>
                    <span className={styles.tag}>{editionTag(book.edition)}</span>
                  </td>
                  <td className={styles.right}>{fmtDateTimeFr(book.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 3.10 Export compta / préparation ── */}
      <section className={styles.panel} aria-labelledby="t-export">
        <h3 className={styles.panelTitle} id="t-export">
          Export compta / préparation
        </h3>
        <OrderExportForm />
        <span className={styles.kbdNote}>
          Bornes vides = toutes les commandes. « Préparation » : statuts payée/préparée
          uniquement ; « compta » : toutes commandes, part de TVA 5,5 % calculée. Colonnes des
          deux profils validées par le client le 13/07.
        </span>
        <span className={styles.freshness}>À la demande · rôles admin + éditeur·rice</span>
      </section>

      {/* ── Complément 3.11 : codes promo expirés encore actifs (la grille native suit) ── */}
      <section className={styles.panel} aria-labelledby="t-promos">
        <h3 className={styles.panelTitle} id="t-promos">
          Codes promo expirés encore actifs
        </h3>
        {expiredPromos.state === 'na' ? (
          <span className={badgeClass('na')}>codes promo indisponibles</span>
        ) : expiredPromos.promos.length === 0 ? (
          <p className={styles.empty}>Aucun code promo expiré encore actif.</p>
        ) : (
          <div className={styles.configList}>
            {expiredPromos.promos.map((promo) => (
              <div key={promo.id} className={styles.configRow}>
                <span className={dotClass('warn')} />
                <a href={`/admin/collections/promo-codes/${promo.id}`}>{promo.code}</a> — expiré le{' '}
                {fmtDateFr(promo.expiresAt)}, encore <span className={styles.tag}>actif</span>
                <PromoDeactivateButton id={promo.id} />
              </div>
            ))}
          </div>
        )}
        <span className={styles.freshness}>
          Calcul côté panneau, aucun nouveau champ · rôles admin + éditeur·rice
        </span>
      </section>

      {/* Légende en pied pour un editor — l'admin la reçoit du footer (3.12/3.13). */}
      {!admin && <DashboardLegend />}
    </div>
  )
}
