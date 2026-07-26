import { cache } from 'react'

import type { Payload } from 'payload'

import { expiredActivePromos, STOCK_SEUIL_FALLBACK } from './derive.ts'
import { parseStoredImportReport } from '../../lib/import-run-report-core.ts'

/**
 * Lecteurs I/O du dashboard `/admin` v3 (home = zones A/B/C, issue #23) —
 * Local API Payload et API Sentry. Règle du chantier : chaque lecteur attrape
 * TOUT et dégrade en `{ state: 'na' }` — le RSC appelant ne plante jamais.
 * Les dérivations pures (états, seuils, bornes) vivent dans `derive.ts` ; le
 * rendu dans `Dashboard.tsx` (home) et `../health/HealthPage.tsx` (vue
 * admin-only `/admin/sante`, issue #27).
 *
 * NB requêtes commandes : `orders.status` est indexé (migration
 * `20260717_150000_orders_status_index`).
 */

/* ────────────────────────── Commandes à traiter (3.2) ────────────────────────── */

export interface WorkOrderRow {
  id: number
  number: string
  status: string
  createdAt: string
  paidAt: string | null
  linesCount: number
  totalTTC: number
  shippingMethod: 'standard' | 'reduit' | 'offert'
}

export type WorkOrdersData = { state: 'ok'; orders: WorkOrderRow[] } | { state: 'na' }

/** Commandes `paid`/`prepared` par ancienneté — la liste de travail du jour. */
export async function readWorkOrders(payload: Payload): Promise<WorkOrdersData> {
  try {
    const { docs } = await payload.find({
      collection: 'orders',
      where: { status: { in: ['paid', 'prepared'] } },
      // Select API (issue #68) : la ligne de travail n'affiche que ces
      // champs — pas les coordonnées client, l'adresse, les identifiants
      // Stripe, etc. portés par le reste de la fiche commande.
      select: {
        number: true,
        status: true,
        createdAt: true,
        paidAt: true,
        lines: true,
        totalTTC: true,
        shippingMethod: true,
      },
      sort: 'createdAt',
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      orders: docs.map((doc) => ({
        id: doc.id,
        number: doc.number ?? `#${doc.id}`,
        status: doc.status,
        createdAt: doc.createdAt,
        paidAt: doc.paidAt ?? null,
        linesCount: doc.lines?.length ?? 0,
        totalTTC: doc.totalTTC,
        shippingMethod: doc.shippingMethod,
      })),
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Stock bas (3.3) ────────────────────────── */

export interface LowStockRow {
  id: number
  title: string
  edition: string | null
  stock: number
}

export type LowStockData =
  | { state: 'ok'; seuil: number; seuilIllisible: boolean; rows: LowStockRow[] }
  | { state: 'na' }

/**
 * Titres vendables sous le seuil (0 compris, tri croissant : les épuisés en
 * premier). Le seuil vient de `reglages-boutique` ; s'il est illisible,
 * l'alerte est basée sur le défaut 3 ET l'UI le dit explicitement
 * (`seuilIllisible`, design v2 §3.3) plutôt que d'échouer en silence.
 */
export async function readLowStock(payload: Payload): Promise<LowStockData> {
  let seuil = STOCK_SEUIL_FALLBACK
  let seuilIllisible = false
  try {
    const settings = await payload.findGlobal({ slug: 'reglages-boutique', depth: 0 })
    seuil = settings?.seuilAlerteStockBas ?? STOCK_SEUIL_FALLBACK
  } catch {
    seuilIllisible = true
  }

  try {
    const { docs } = await payload.find({
      collection: 'books',
      where: {
        and: [
          { 'commerce.sellable': { equals: true } },
          { 'commerce.stock': { exists: true } },
          { 'commerce.stock': { less_than_equal: seuil } },
          // Un « à paraître » n'a pas encore de stock à surveiller (spec §3.3).
          { aParaitre: { equals: false } },
        ],
      },
      // Select API (issue #68) : ce panneau n'affiche que titre/édition/stock.
      select: { title: true, edition: true, commerce: { stock: true } },
      sort: 'commerce.stock',
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      seuil,
      seuilIllisible,
      rows: docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        edition: doc.edition ?? null,
        stock: doc.commerce?.stock ?? 0,
      })),
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Import routeur (3.7) ────────────────────────── */

export interface LastImportRun {
  id: number
  createdAt: string
  nbLignes: number
  nbMatchees: number
  /** Total des non-appariés du rapport — `null` si le JSON stocké est illisible. */
  nonApparies: number | null
}

export type LastImportRunData = { state: 'ok'; run: LastImportRun | null } | { state: 'na' }

/** Dernier run d'import (`import-runs`, createdAt = date d'import). `run: null` = aucun import enregistré (état gris, pas une erreur). */
export async function readLastImportRun(payload: Payload): Promise<LastImportRunData> {
  try {
    const { docs } = await payload.find({
      collection: 'import-runs',
      sort: '-createdAt',
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    const doc = docs[0]
    if (!doc) return { state: 'ok', run: null }
    const report = parseStoredImportReport(doc.rapport)
    return {
      state: 'ok',
      run: {
        id: doc.id,
        createdAt: doc.createdAt,
        nbLignes: doc.nbLignes,
        nbMatchees: doc.nbMatchees,
        nonApparies: report
          ? report.routerRowsWithoutBook +
            report.routerBooksMissingFromFile.length +
            report.manualBooksNotInFile.length
          : null,
      },
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Codes promo expirés (3.11) ────────────────────────── */

export interface ExpiredPromoRow {
  id: number
  code: string
  expiresAt: string
}

export type ExpiredPromosData = { state: 'ok'; promos: ExpiredPromoRow[] } | { state: 'na' }

/** Codes encore `active` dont `expiresAt` est dépassé — candidats au « désactiver en un clic ». */
export async function readExpiredPromos(payload: Payload, now: Date): Promise<ExpiredPromosData> {
  try {
    const { docs } = await payload.find({
      collection: 'promo-codes',
      where: {
        and: [{ active: { equals: true } }, { expiresAt: { exists: true } }],
      },
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      promos: expiredActivePromos(docs, now).map((doc) => ({
        id: doc.id,
        code: doc.code,
        expiresAt: doc.expiresAt ?? '',
      })),
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Observabilité Sentry (3.12) ────────────────────────── */

export interface SentryIssue {
  id: string
  title: string
  count: number
  permalink: string | null
}

export type SentryData =
  | { state: 'ok'; errorEvents: number; unresolvedCount: number; top: SentryIssue[] }
  | { state: 'na' }

interface SentryApiIssue {
  id?: string | number
  title?: string
  count?: string | number
  level?: string
  permalink?: string
}

/**
 * Issues non résolues des dernières 24 h, triées par fréquence. Capacité
 * nouvelle : token DÉDIÉ `SENTRY_DASHBOARD_TOKEN` (read-only, scope
 * `event:read` — séparé du token build `SENTRY_AUTH_TOKEN`, cf.
 * `.env.example`). Une des trois variables absente, ou réponse non-ok →
 * `na` (gris « diagnostic technique : indisponible »), JAMAIS vert par
 * défaut. Ce fetch vit ici (back-office) et pas dans `src/lib` : le contrat
 * réseau de `src/lib` est fermé (`donations`/`brevo` uniquement, cf.
 * `src/lib/CLAUDE.md`).
 *
 * `cache()` : mémoïsation par requête (défensive — un seul appelant
 * aujourd'hui, `../health/HealthPage.tsx`, vue `/admin/sante`, issue #27 ;
 * le bandeau de la home n'affiche pas de pastille Sentry, cf. `Dashboard.tsx`
 * et cette même issue). Fraîcheur : `revalidate: 180` (spec §3.12, fenêtre
 * 120-300 s).
 */
export const readSentryIssues = cache(async (): Promise<SentryData> => {
  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  const token = process.env.SENTRY_DASHBOARD_TOKEN
  if (!org || !project || !token) return { state: 'na' }

  try {
    const res = await fetch(
      `https://de.sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&statsPeriod=24h&sort=freq&limit=25`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 180 },
      },
    )
    if (!res.ok) return { state: 'na' }
    const json: unknown = await res.json()
    if (!Array.isArray(json)) return { state: 'na' }

    const issues = (json as SentryApiIssue[]).map((issue) => ({
      id: String(issue.id ?? ''),
      title: typeof issue.title === 'string' ? issue.title : '(sans titre)',
      // `count` arrive en chaîne dans l'API Sentry (cf. `derive.ts`).
      count: Number(issue.count) || 0,
      level: typeof issue.level === 'string' ? issue.level : undefined,
      permalink: typeof issue.permalink === 'string' ? issue.permalink : null,
    }))

    const errorEvents = issues
      .filter((issue) => issue.level === 'error' || issue.level === 'fatal')
      .reduce((sum, issue) => sum + issue.count, 0)

    return {
      state: 'ok',
      errorEvents,
      unresolvedCount: issues.length,
      top: issues.slice(0, 3).map(({ id, title, count, permalink }) => ({ id, title, count, permalink })),
    }
  } catch {
    return { state: 'na' }
  }
})

/* ────────────────────────── Dernière commande écrite (3.12) ────────────────────────── */

export type LastOrderData =
  | { state: 'ok'; last: { id: number; number: string; createdAt: string } | null }
  | { state: 'na' }

/** Proxy d'activité webhook — informatif SEUL, jamais un signal de panne (l'absence de vente est un fait métier normal). */
export async function readLastOrder(payload: Payload): Promise<LastOrderData> {
  try {
    const { docs } = await payload.find({
      collection: 'orders',
      sort: '-createdAt',
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    const doc = docs[0]
    return {
      state: 'ok',
      last: doc ? { id: doc.id, number: doc.number ?? `#${doc.id}`, createdAt: doc.createdAt } : null,
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Configuration & accès (3.13) ────────────────────────── */

export interface ConfigData {
  /** Présence + mode — jamais la valeur. */
  stripeMode: 'live' | 'test' | 'absent'
  sentryBuildToken: boolean
  sentryDashboardToken: boolean
  databaseUrl: boolean
  /** `null` = compte illisible. */
  lockedAccounts: number | null
}

/** Présence des variables critiques (booléens seulement) + comptes verrouillés. */
export async function readConfig(payload: Payload, now: Date): Promise<ConfigData> {
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  const stripeMode: ConfigData['stripeMode'] = key.startsWith('sk_live_')
    ? 'live'
    : key.startsWith('sk_test_')
      ? 'test'
      : 'absent'

  let lockedAccounts: number | null = null
  try {
    const { totalDocs } = await payload.count({
      collection: 'users',
      where: { lockUntil: { greater_than: now.toISOString() } },
      overrideAccess: true,
    })
    lockedAccounts = totalDocs
  } catch {
    lockedAccounts = null
  }

  return {
    stripeMode,
    sentryBuildToken: Boolean(process.env.SENTRY_AUTH_TOKEN),
    sentryDashboardToken: Boolean(process.env.SENTRY_DASHBOARD_TOKEN),
    databaseUrl: Boolean(process.env.DATABASE_URL),
    lockedAccounts,
  }
}
