import { redirect } from 'next/navigation'

import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'

import { badgeClass, dotClass } from '../dashboard/dashboard-classes.ts'
import { readLastImportRun, readLowStock } from '../dashboard/data.ts'
import {
  fmtDateTimeFr,
  IMPORT_ALERT_DAYS,
  importSignal,
  STOCK_SEUIL_FALLBACK,
  stockRowState,
  stockSignal,
  editionTag,
  type PanelState,
} from '../dashboard/derive.ts'
import styles from '../dashboard/dashboard.module.css'
import { DashboardLegend } from '../dashboard/Legend.tsx'
import { StockImportForm } from '../dashboard/StockImportForm.tsx'

/**
 * Vue admin `/admin/stock` : stock bas + fraîcheur / import routeur.
 * Sortie de la home (`Dashboard.tsx`) pour alléger le poste de travail.
 * Accès admin OU editor (même périmètre que `Books.access.update`) ; le
 * formulaire d'import reste admin-only. Chrome `DefaultTemplate` manuel —
 * même raison que `../health/HealthPage.tsx`.
 */
export async function StockPage(props: AdminViewServerProps) {
  const { initPageResult, params, payload, searchParams } = props

  const role = initPageResult.req.user?.role
  if (role !== 'admin' && role !== 'editor') {
    redirect('/admin')
  }
  const admin = role === 'admin'
  const now = new Date()

  const [lowStock, importRun] = await Promise.all([
    readLowStock(payload),
    readLastImportRun(payload),
  ])

  const stockState: PanelState =
    lowStock.state === 'na' ? 'na' : stockSignal(lowStock.rows.map((row) => row.stock))
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
        <h1>Stock</h1>
        <div className={styles.board}>
          <section className={styles.panel} id="panneau-stock" aria-labelledby="t-stock">
            <h2 className={styles.panelTitle} id="t-stock">
              <span className={dotClass(stockState)} /> Stock bas
            </h2>
            {lowStock.state === 'na' ? (
              <span className={badgeClass('na')}>liste stock indisponible</span>
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
                    {STOCK_SEUIL_FALLBACK}
                  </span>
                )}
                {lowStock.rows.length === 0 ? (
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
              </>
            )}
            <div className={styles.actions}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
              <a href="/admin/globals/reglages-boutique">Modifier le seuil (admin) →</a>
            </div>
          </section>

          <section className={styles.panel} id="panneau-import" aria-labelledby="t-import">
            <h2 className={styles.panelTitle} id="t-import">
              <span className={dotClass(importState)} /> Import routeur
            </h2>
            {importRun.state === 'na' ? (
              <span className={badgeClass('na')}>historique des imports indisponible</span>
            ) : importRun.run === null ? (
              <span className={badgeClass('na')}>Aucun import enregistré</span>
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
