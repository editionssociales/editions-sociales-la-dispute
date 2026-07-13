import type { ServerProps } from 'payload'

import { fmtDateTimeFr, sentrySignal, type PanelState } from './derive.ts'
import { readConfig, readLastOrder, readSentryIssues } from './data.ts'
import styles from './dashboard.module.css'
import { DashboardLegend } from './Legend.tsx'

/**
 * Slot `afterDashboard` du dashboard `/admin` v2 : observabilité (3.12) et
 * configuration & accès (3.13), SOUS la grille native `CollectionCards` —
 * rôle strictement admin (`null` pour un editor, qui reçoit sa légende via
 * `Dashboard`). Mêmes lecteurs `data.ts` que le bandeau : `readSentryIssues`
 * est mémoïsé (`cache()`), une seule lecture par requête.
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

export async function DashboardFooter({ payload, user }: ServerProps) {
  if (user?.role !== 'admin') return null

  const now = new Date()
  const [sentry, lastOrder, config] = await Promise.all([
    readSentryIssues(),
    readLastOrder(payload),
    readConfig(payload, now),
  ])

  const diagState = sentrySignal(sentry.state === 'ok' ? sentry.errorEvents : null)

  return (
    <div className={styles.board}>
      {/* ── 3.12 Observabilité (Sentry + santé webhook) ── */}
      <section className={styles.panel} id="panneau-observabilite" aria-labelledby="t-obs">
        <h3 className={styles.panelTitle} id="t-obs">
          <span className={dotClass(diagState)} /> Observabilité (Sentry + santé webhook)
        </h3>
        {sentry.state === 'na' ? (
          <>
            <span className={badgeClass('na')}>diagnostic technique : indisponible</span>
            <p className={styles.muted}>
              Token Sentry <code>event:read</code> (SENTRY_DASHBOARD_TOKEN) absent, ou API
              injoignable — jamais vert par défaut.
            </p>
          </>
        ) : (
          <>
            <span className={badgeClass(diagState)}>
              {sentry.errorEvents > 0
                ? `${sentry.errorEvents} événement(s) d’erreur sur 24 h`
                : 'aucun événement d’erreur sur 24 h'}
            </span>
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

      {/* ── 3.13 Configuration & accès ── */}
      <section className={styles.panel} aria-labelledby="t-config">
        <h3 className={styles.panelTitle} id="t-config">
          Configuration &amp; accès
        </h3>
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
        {/*
         * Bloc de transition — rendu UNIQUEMENT tant que CATALOGUE_SOURCE !== 'pg'
         * (cf. `readConfig`). À SUPPRIMER (bloc + branche de data.ts) une fois la
         * bascule confirmée stable : simple test, jamais un flag long terme
         * (design v2 §5, extinction des panneaux transitoires le jour du swap).
         */}
        {config.transition && (
          <div className={styles.transitionBox}>
            <strong>Transition (jusqu’à la bascule) — catalogue piloté par {config.transition.catalogueSourceLabel}</strong>
            <div className={styles.configRow}>
              <span className={dotClass(config.transition.wpEs ? 'ok' : 'warn')} />
              <code>WP_ES_URL</code> {config.transition.wpEs ? 'posée' : 'absente'}
            </div>
            <div className={styles.configRow}>
              <span className={dotClass(config.transition.wpLd ? 'ok' : 'warn')} />
              <code>WP_LD_URL</code> {config.transition.wpLd ? 'posée' : 'absente'}
            </div>
            <div className={styles.configRow}>
              <span className={dotClass(config.transition.wcStore ? 'ok' : 'warn')} />
              <code>WC_STORE_URL</code> {config.transition.wcStore ? 'posée' : 'absente'}
            </div>
            <span>
              Ce bloc disparaît (avec son code) une fois la bascule <code>CATALOGUE_SOURCE=pg</code>{' '}
              confirmée stable.
            </span>
          </div>
        )}
        <span className={styles.noteChip}>
          visible pour le rôle admin uniquement · aucune pastille correspondante dans le bandeau
          partagé
        </span>
      </section>

      <DashboardLegend />
    </div>
  )
}
