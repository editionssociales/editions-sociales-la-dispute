import { redirect } from 'next/navigation'

import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { Pill } from '@payloadcms/ui'

import { dotClass, dotLabel, pillStyleForState } from '../dashboard/dashboard-classes.ts'
import { readConfig, readLastOrder, readSentryIssues } from '../dashboard/data.ts'
import { fmtDateTimeFr, sentrySignal } from '../dashboard/derive.ts'
import styles from '../dashboard/dashboard.module.css'
import { DashboardLegend } from '../dashboard/Legend.tsx'

/**
 * Vue admin dédiée `/admin/sante` (issue #27) : observabilité (Sentry + santé
 * webhook) et configuration & accès — anciens panneaux 3.12/3.13 de
 * `DashboardFooter` (supprimé), sortis de la home pour rester rôle admin
 * STRICT (un·e editor qui force l'URL est renvoyé·e vers `/admin`, jamais un
 * rendu partiel — `Dashboard.tsx` reste la seule vue d'un editor). Mêmes
 * lecteurs `data.ts` que l'ancien panneau, même invariant non négociable :
 * token Sentry absent → `na` explicite, jamais vert par défaut. Enregistrée
 * dans `payload.config.ts` sous `admin.components.views.sante`.
 *
 * Chrome (nav/header) — pourquoi l'appel à `DefaultTemplate` est manuel :
 * `RootPage` (`@payloadcms/next/dist/views/Root/index.js`) n'applique le
 * template par défaut automatiquement qu'aux vues qui RECOUVRENT un
 * `viewKey` connu (`account`, `dashboard`…) ou aux vues imbriquées
 * (document/liste) — cf. `getRouteData.js`, `case 1` : une vue de premier
 * niveau enregistrée sous une NOUVELLE clé (`sante`) n'obtient pas de
 * `templateType`, donc pas de chrome automatique. Même pattern que la page
 * 404 de Payload (`@payloadcms/next/dist/views/NotFound/index.js`), qui
 * appelle elle aussi `DefaultTemplate` à la main avec exactement ce jeu de
 * props dérivées de `initPageResult`.
 *
 * `.gutter`/`.gutter--left`/`.gutter--right` : classes du composant `Gutter`
 * (`@payloadcms/ui/dist/elements/Gutter`), reprises littéralement (même
 * rendu, mêmes défauts `left`/`right`) plutôt qu'importées — `@payloadcms/ui`
 * n'est pas une dépendance directe de ce dépôt (transitive via
 * `@payloadcms/next` seulement, non résoluble depuis `src/`) ; son CSS est
 * déjà chargé globalement par `@payloadcms/next/css` (`(payload)/layout.tsx`).
 */
export async function HealthPage(props: AdminViewServerProps) {
  const { initPageResult, params, payload, searchParams } = props

  if (initPageResult.req.user?.role !== 'admin') {
    redirect('/admin')
  }

  const now = new Date()
  const [sentry, lastOrder, config] = await Promise.all([
    readSentryIssues(),
    readLastOrder(payload),
    readConfig(payload, now),
  ])

  const diagState = sentrySignal(sentry.state === 'ok' ? sentry.errorEvents : null)

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      // `req.user` est `TypedUser | null` (jamais `undefined`) — `ServerProps.user`
      // attend `TypedUser | undefined` ; conversion sans effet ici, la garde
      // ci-dessus a déjà rejeté tout `user` non-admin (donc non `null`).
      user={initPageResult.req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <div className="gutter gutter--left gutter--right">
        <h1>Santé</h1>
        <div className={styles.board}>
          {/* ── Observabilité (Sentry + santé webhook) ── */}
          <section className={styles.panel} aria-labelledby="t-obs">
            <h2 className={styles.panelTitle} id="t-obs">
              <span className={dotClass(diagState)} role="img" aria-label={dotLabel(diagState)} />{' '}
              Observabilité (Sentry + santé webhook)
            </h2>
            {sentry.state === 'na' ? (
              <>
                <Pill pillStyle={pillStyleForState('na')} size="small">
                  diagnostic technique : indisponible
                </Pill>
                <p className={styles.muted}>
                  Token Sentry <code>event:read</code> (SENTRY_DASHBOARD_TOKEN) absent, ou API
                  injoignable — jamais vert par défaut.
                </p>
              </>
            ) : (
              <>
                <Pill pillStyle={pillStyleForState(diagState)} size="small">
                  {sentry.errorEvents > 0
                    ? `${sentry.errorEvents} événement(s) d’erreur sur 24 h`
                    : 'aucun événement d’erreur sur 24 h'}
                </Pill>
                <p className={styles.muted}>
                  Issues non résolues (24 h) : <strong>{sentry.unresolvedCount}</strong>
                </p>
                {sentry.top.length > 0 && (
                  <div className={styles.configList}>
                    {sentry.top.map((issue) => (
                      <div key={issue.id} className={styles.configRow}>
                        <span className={styles.tag}>×{issue.count}</span>
                        {issue.permalink ? (
                          <a href={issue.permalink} target="_blank" rel="noreferrer">
                            {issue.title}
                          </a>
                        ) : (
                          issue.title
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <p className={styles.muted}>
              Dernière commande écrite :{' '}
              {lastOrder.state === 'na' ? (
                <strong>indisponible</strong>
              ) : lastOrder.last === null ? (
                <strong>aucune commande écrite pour l’instant</strong>
              ) : (
                <>
                  <a href={`/admin/collections/orders/${lastOrder.last.id}`}>{lastOrder.last.number}</a>{' '}
                  — {fmtDateTimeFr(lastOrder.last.createdAt)}
                </>
              )}
            </p>
            <span className={styles.kbdNote}>
              « Dernière commande écrite » est un proxy informatif de l’activité webhook — jamais un
              signal de panne isolé : l’absence de vente est un fait métier normal, pas une panne.
            </span>
            <div className={styles.actions}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
              <a href="/admin/collections/orders">Voir les commandes →</a>
            </div>
            <span className={styles.freshness}>Actualisation 180 s · rôle admin uniquement</span>
          </section>

          {/* ── Configuration & accès ── */}
          <section className={styles.panel} aria-labelledby="t-config">
            <h2 className={styles.panelTitle} id="t-config">
              Configuration &amp; accès
            </h2>
            <div className={styles.configList}>
              <div className={styles.configRow}>
                <span className={dotClass(config.stripeMode === 'absent' ? 'alert' : 'ok')} />
                {config.stripeMode === 'absent' ? (
                  <>
                    contacter le développeur : <code>STRIPE_SECRET_KEY</code> absente
                  </>
                ) : (
                  <>
                    <code>STRIPE_SECRET_KEY</code> posée — mode{' '}
                    {config.stripeMode === 'test' ? 'test' : 'live'}
                  </>
                )}
              </div>
              <div className={styles.configRow}>
                <span className={dotClass(config.sentryBuildToken ? 'ok' : 'warn')} />
                {config.sentryBuildToken ? (
                  <>
                    <code>SENTRY_AUTH_TOKEN</code> (build) posée
                  </>
                ) : (
                  <>
                    contacter le développeur : <code>SENTRY_AUTH_TOKEN</code> (build) absente
                  </>
                )}
              </div>
              <div className={styles.configRow}>
                <span className={dotClass(config.sentryDashboardToken ? 'ok' : 'warn')} />
                {config.sentryDashboardToken ? (
                  <>
                    <code>SENTRY_DASHBOARD_TOKEN</code> (2ᵉ token, lecture des erreurs) posée
                  </>
                ) : (
                  <>
                    contacter le développeur : <code>SENTRY_DASHBOARD_TOKEN</code> (2ᵉ token, lecture
                    des erreurs) absente — panneau « Observabilité » gris tant qu’elle manque
                  </>
                )}
              </div>
              <div className={styles.configRow}>
                <span className={dotClass(config.databaseUrl ? 'ok' : 'alert')} />
                {config.databaseUrl ? (
                  <>
                    <code>DATABASE_URL</code> posée
                  </>
                ) : (
                  <>
                    contacter le développeur : <code>DATABASE_URL</code> absente
                  </>
                )}
              </div>
              <div className={styles.configRow}>
                <span
                  className={dotClass(
                    config.lockedAccounts === null ? 'na' : config.lockedAccounts > 0 ? 'alert' : 'ok',
                  )}
                />
                Comptes verrouillés :{' '}
                <strong>{config.lockedAccounts === null ? 'indisponible' : config.lockedAccounts}</strong>
              </div>
            </div>
            <span className={styles.kbdNote}>
              Présence des variables seulement — jamais leur valeur. Si une variable manque, relayer le
              nom exact au développeur.
            </span>
            <span className={styles.noteChip}>page réservée au rôle admin</span>
          </section>

          <DashboardLegend />
        </div>
      </div>
    </DefaultTemplate>
  )
}
