import type { WorkOrdersData } from './data.ts'
import { isPromoExpired } from '../../../lib/promo-core.ts'

/**
 * Cœur pur du tableau de bord `/admin` (design v3 — home allégée : file du
 * jour + alertes promo + raccourcis) — dérivations sans I/O, testées dans
 * `derive.test.ts`. Les lectures Payload/Stripe/Sentry vivent dans `data.ts`,
 * le rendu dans `Dashboard.tsx`, `../stock/StockPage.tsx` (`/admin/stock`),
 * `../health/HealthPage.tsx` (`/admin/sante`, admin) et `dashboard-classes.ts`.
 *
 * Principe non négociable du design : jamais de vert ni de zéro « par
 * défaut » — un signal non calculable est `na` (gris, « diagnostic
 * indisponible »), pas `ok`.
 *
 * `import type { ... } from './data.ts'` ci-dessus : uniquement des types
 * (effacés à la compilation, `isolatedModules`) — `data.ts` importe des
 * valeurs de ce module, pas l'inverse ; aucune dépendance runtime circulaire.
 */

/** État d'un signal/panneau — `na` = non calculable (gris), jamais converti en vert. */
export type PanelState = 'ok' | 'warn' | 'alert' | 'na'

/* ────────────────────────── Commandes (3.2) ────────────────────────── */

/**
 * Seuils de retard d'une commande `paid` non passée `prepared` — PROPOSITION
 * non actée par le client (design v2 §3.2) : l'UI doit les afficher comme
 * « provisoires, à valider », d'où leur export (repris dans le texte du
 * panneau, pas seulement dans la logique).
 */
export const ORDER_WARN_HOURS = 48
export const ORDER_ALERT_HOURS = 72

const HOUR_MS = 3_600_000

/**
 * Retard d'une commande de la liste de travail : seule une commande encore
 * `paid` vieillit (une `prepared` est considérée prise en charge). L'âge se
 * mesure depuis `paidAt`, à défaut `createdAt` (les deux sont posés par le
 * webhook au même moment en pratique).
 */
export function orderLateness(
  order: { status: string; paidAt?: string | null; createdAt: string },
  now: Date,
): PanelState {
  if (order.status !== 'paid') return 'ok'
  const since = Date.parse(order.paidAt ?? order.createdAt)
  if (Number.isNaN(since)) return 'ok'
  const ageHours = (now.getTime() - since) / HOUR_MS
  if (ageHours > ORDER_ALERT_HOURS) return 'alert'
  if (ageHours > ORDER_WARN_HOURS) return 'warn'
  return 'ok'
}

/** Pire état d'un ensemble d'états (pour un signal de panneau ou le bandeau). */
export function worstState(states: PanelState[]): PanelState {
  if (states.includes('alert')) return 'alert'
  if (states.includes('warn')) return 'warn'
  if (states.includes('na')) return 'na'
  return 'ok'
}

/**
 * État du signal Commandes (bandeau 3.1, dot du panneau 3.2) : liste de
 * travail `null`/illisible → gris ; sinon le pire retard des commandes de la
 * liste (cf. `orderLateness`).
 */
export function commandesState(workOrders: WorkOrdersData | null, now: Date): PanelState {
  if (workOrders === null || workOrders.state === 'na') return 'na'
  return worstState(workOrders.orders.map((order) => orderLateness(order, now)))
}

/* ────────────────────────── Stock bas (3.3) ────────────────────────── */

/** Défaut du seuil quand `reglages-boutique` est illisible (affiché explicitement dans l'UI). */
export const STOCK_SEUIL_FALLBACK = 3

/** État d'une ligne : 0 = épuisé (« indisponible en ligne »), sinon stock bas. */
export function stockRowState(stock: number): Extract<PanelState, 'warn' | 'alert'> {
  return stock <= 0 ? 'alert' : 'warn'
}

/** Signal du panneau stock : un titre à 0 → alerte ; sous le seuil → attention ; sinon OK. */
export function stockSignal(stocks: number[]): PanelState {
  if (stocks.some((s) => s <= 0)) return 'alert'
  if (stocks.length > 0) return 'warn'
  return 'ok'
}

/* ────────────────────────── Raccourci « Ventes du mois » (zone C) ────────────────────────── */

/**
 * Bornes UTC du mois civil courant **à l'heure de Paris** (les `paidAt` sont
 * stockés en UTC). Un 1ᵉʳ du mois n'est jamais dans la fenêtre de changement
 * d'heure (dernier dimanche de mars/octobre) : le décalage d'un début de mois
 * est donc déterministe — avril→octobre : UTC+2 (CEST), novembre→mars : UTC+1.
 */
export function parisMonthBounds(now: Date): { start: Date; end: Date; label: string } {
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: 'numeric',
  })
  const parts = fmt.formatToParts(now)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value) // 1-12

  const startUtc = parisMonthStartUtc(year, month)
  const endUtc = month === 12 ? parisMonthStartUtc(year + 1, 1) : parisMonthStartUtc(year, month + 1)
  const label = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    month: 'long',
    year: 'numeric',
  }).format(startUtc)
  return { start: startUtc, end: endUtc, label }
}

/** Minuit Paris du 1ᵉʳ du mois (1-12), en UTC. */
function parisMonthStartUtc(year: number, month: number): Date {
  const offsetHours = month >= 4 && month <= 10 ? 2 : 1
  return new Date(Date.UTC(year, month - 1, 1, -offsetHours))
}

/* ────────────────────────── Export CSV (bornes de dates) ────────────────────────── */

/** Date civile Paris au format `AAAA-MM-JJ` (valeur d'un `<input type="date">`). */
export function parisDateYmd(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Plage d'export par défaut : `to` = aujourd'hui (Paris), `from` = même jour
 * un mois civil plus tôt (jour calé si le mois cible est plus court).
 */
export function defaultExportDateRange(now: Date): { from: string; to: string } {
  const to = parisDateYmd(now)
  const [y, m, d] = to.split('-').map(Number)
  let year = y
  let month = m - 1
  if (month < 1) {
    month = 12
    year -= 1
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(d, daysInMonth)
  const from = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { from, to }
}

/* ────────────────────────── Import routeur (3.7) ────────────────────────── */

/**
 * Seuil d'alerte de fraîcheur de l'import mensuel — PROPOSITION non actée par
 * le client (design v2 §3.7), affichée comme provisoire dans l'UI.
 */
export const IMPORT_ALERT_DAYS = 35

const DAY_MS = 86_400_000

/**
 * Signal de fraîcheur : aucun import enregistré → gris (pas un rouge
 * alarmiste au lancement) ; dernier import > 35 j → alerte ; sinon OK.
 */
export function importSignal(lastRunAt: string | null, now: Date): PanelState {
  if (!lastRunAt) return 'na'
  const at = Date.parse(lastRunAt)
  if (Number.isNaN(at)) return 'na'
  return (now.getTime() - at) / DAY_MS > IMPORT_ALERT_DAYS ? 'alert' : 'ok'
}

/* ────────────────────────── Codes promo (3.11) ────────────────────────── */

/**
 * Codes encore `active` dont `expiresAt` est dépassé (comparaison en jour,
 * JOUR INCLUSIF — un code qui expire le 13/07 reste valable toute la
 * journée du 13/07, décision produit 17/07) — candidats au « désactiver en
 * un clic ». `expiresAt` absent = jamais expiré. Même règle, désormais
 * réellement partagée (et non plus seulement affirmée en commentaire) avec
 * l'évaluation panier de `promo-core.ts:evaluatePromoCode` — alignée
 * checkout ↔ dashboard.
 */
export function expiredActivePromos<T extends { active?: boolean | null; expiresAt?: string | null }>(
  promos: T[],
  now: Date,
): T[] {
  return promos.filter((p) => p.active === true && isPromoExpired(p.expiresAt, now))
}

/* ────────────────────────── Observabilité (3.12) ────────────────────────── */

/**
 * Décompte des événements d'erreur sur les issues Sentry non résolues (24 h).
 * `count` arrive en chaîne dans l'API Sentry.
 */
export function sentryErrorEvents(issues: { level?: string; count?: string | number }[]): number {
  return issues
    .filter((i) => i.level === 'error' || i.level === 'fatal')
    .reduce((sum, i) => sum + (Number(i.count) || 0), 0)
}

/** Alerte si au moins un événement `error`/`fatal` en 24 h (design v2 §3.12). */
export function sentrySignal(errorEvents: number | null): PanelState {
  if (errorEvents === null) return 'na'
  return errorEvents > 0 ? 'alert' : 'ok'
}

/* ────────────────────────── Bandeau d'état (3.1) ────────────────────────── */

export interface BannerItem {
  /** Identifiant stable du signal (ancre `#panneau-…`). */
  key: 'commandes' | 'stock' | 'import'
  label: string
  state: PanelState
  /**
   * Ancre vers le panneau correspondant — `null` si le lecteur n'a pas accès
   * au panneau (rôle) OU si le panneau ne sera pas rendu (zone B « Alertes »
   * conditionnelle, design v3 §23) : jamais un lien mort.
   */
  anchor: string | null
}

/**
 * Le bandeau n'existe que s'il a quelque chose à dire : masqué intégralement
 * quand TOUTES les pastilles sont vertes (design v2 §3.1, repris v3) — un
 * gris (signal non calculable) le maintient visible, jamais requalifié en
 * vert.
 */
export function bannerHidden(items: BannerItem[]): boolean {
  return items.every((item) => item.state === 'ok')
}

/** Libellé de pastille, vocabulaire éditeur (jamais de nom d'outil dans le bandeau partagé). */
export function pastilleText(item: BannerItem): string {
  const suffix: Record<PanelState, string> = {
    ok: 'OK',
    warn: 'à vérifier',
    alert: 'en alerte',
    na: 'indisponible',
  }
  if (item.key === 'import' && item.state === 'na') return `${item.label} : aucun import enregistré`
  return `${item.label} : ${suffix[item.state]}`
}

/* ────────────────────────── Formatage ────────────────────────── */

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

/** Montant en euros, format français (les commandes stockent des euros, pas des centimes). */
export function fmtEuros(amount: number): string {
  return EUR.format(amount)
}

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

const DATE_ONLY = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** « 9 juillet, 14:02 » (heure de Paris). */
export function fmtDateTimeFr(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '—' : DATE_TIME.format(t)
}

/** « 3 juillet 2026 » (heure de Paris). */
export function fmtDateFr(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '—' : DATE_ONLY.format(t)
}

/** Tag de maison affiché dans les tableaux (ES / LD / boutique seule). */
export function editionTag(edition: string | null | undefined): string {
  if (edition === 'editions-sociales') return 'ES'
  if (edition === 'la-dispute') return 'LD'
  return 'BOUT.'
}
