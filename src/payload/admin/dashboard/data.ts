import { cache } from 'react'

import type { Payload } from 'payload'

import { CAMPAIGN_KEY, type Campaign2026 } from '@/lib/donation-tiers'
import { getCampaign2026 } from '@/lib/donations'
import { donationsEnabled, getStripe } from '@/lib/stripe'

import { expiredActivePromos, parisMonthBounds, STOCK_SEUIL_FALLBACK, sumSalesTTC } from './derive.ts'
import { parseStoredImportReport } from '../../lib/import-run-report-core.ts'

/**
 * Lecteurs I/O du dashboard `/admin` v2 — Local API Payload, Stripe (SDK) et
 * API Sentry. Règle du chantier : chaque lecteur attrape TOUT et dégrade en
 * `{ state: 'na' }` — le RSC appelant ne plante jamais (l'ancien
 * `StockLowWidget` n'avait aucun filet, défaut corrigé ici). Les dérivations
 * pures (états, seuils, bornes) vivent dans `derive.ts` ; le rendu dans
 * `Dashboard.tsx` / `DashboardFooter.tsx`.
 *
 * NB requêtes commandes : `orders.status` est indexé (design v2 §6, migration
 * `20260717_150000_orders_status_index`) — PAS d'index sur `orders.paid_at`
 * (filtre CA du mois, 3.5) : ce tri-là scanne encore la table, non bloquant à
 * la volumétrie attendue.
 */

const DAY_MS = 86_400_000

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

/* ────────────────────────── Remboursements (3.4) ────────────────────────── */

export interface RefundRow {
  id: number
  number: string
  email: string
  totalTTC: number
  createdAt: string
}

export type RefundsData = { state: 'ok'; refunds: RefundRow[] } | { state: 'na' }

/**
 * Commandes `refunded`, plus récentes d'abord. Pas de `refundedAt` ni de
 * montant remboursé dans le modèle (remboursement partiel non modélisé,
 * demande au lot 2 — design v2 §6) : la liste est triée par `createdAt`.
 */
export async function readRefunds(payload: Payload): Promise<RefundsData> {
  try {
    const { docs } = await payload.find({
      collection: 'orders',
      where: { status: { equals: 'refunded' } },
      sort: '-createdAt',
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      refunds: docs.map((doc) => ({
        id: doc.id,
        number: doc.number ?? `#${doc.id}`,
        email: doc.email,
        totalTTC: doc.totalTTC,
        createdAt: doc.createdAt,
      })),
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Ventes du mois (3.5) ────────────────────────── */

export type MonthSalesData =
  | { state: 'ok'; totalTTC: number; count: number; monthLabel: string; start: Date; end: Date }
  | { state: 'na'; monthLabel: string }

/**
 * CA BRUT du mois civil de Paris (`paidAt` dans les bornes) + nombre de
 * commandes. `cancelled` est exclu (spec §3.5) et `failed` AUSSI : une
 * commande `failed` (paiement différé refusé) n'a jamais été encaissée — la
 * compter fausserait le chiffre. `refunded` reste inclus : CA brut,
 * « remboursements non déduits » affiché tant que la décision produit
 * (design v2 §6) n'est pas tranchée.
 */
export async function readMonthSales(payload: Payload, now: Date): Promise<MonthSalesData> {
  const { start, end, label } = parisMonthBounds(now)
  try {
    const { docs } = await payload.find({
      collection: 'orders',
      where: {
        and: [
          { paidAt: { greater_than_equal: start.toISOString() } },
          { paidAt: { less_than: end.toISOString() } },
          { status: { not_in: ['cancelled', 'failed'] } },
        ],
      },
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      totalTTC: sumSalesTTC(docs),
      count: docs.length,
      monthLabel: label,
      start,
      end,
    }
  } catch {
    return { state: 'na', monthLabel: label }
  }
}

/* ────────────────────────── Dons (3.6) ────────────────────────── */

export interface DonationsData {
  /** Dérivé du préfixe de `STRIPE_SECRET_KEY` — jamais la valeur. */
  mode: 'live' | 'test' | 'absent'
  /** `null` = jauge non calculable (`getCampaign2026()` absorbe toute erreur). */
  gauge: Campaign2026 | null
  /** 5 derniers dons (montant + date, JAMAIS nom/email) — `null` = liste illisible, distinct de « aucun don ». */
  recent: { amountEur: number; createdAt: string }[] | null
  /** Remboursements ≤ 7 jours — `null` = illisible. */
  refunds7d: number | null
  lastDonationAt: string | null
}

/**
 * Panneau dons, repris du design v1 §3.2 : jauge via `getCampaign2026()`,
 * derniers dons via `charges.list` (PAS la Search API — latence d'indexation
 * incompatible avec « récent »), remboursements via `refunds.list`.
 */
export async function readDonations(now: Date): Promise<DonationsData> {
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  const mode: DonationsData['mode'] = key.startsWith('sk_live_')
    ? 'live'
    : key.startsWith('sk_test_')
      ? 'test'
      : 'absent'

  if (mode === 'absent' || !donationsEnabled()) {
    return { mode: 'absent', gauge: null, recent: null, refunds7d: null, lastDonationAt: null }
  }

  const gauge = await getCampaign2026()

  let recent: DonationsData['recent'] = null
  let lastDonationAt: string | null = null
  try {
    const { data } = await getStripe().charges.list({ limit: 10 })
    recent = data
      .filter((charge) => charge.metadata?.campaign === CAMPAIGN_KEY)
      .slice(0, 5)
      .map((charge) => ({
        amountEur: charge.amount / 100,
        createdAt: new Date(charge.created * 1000).toISOString(),
      }))
    lastDonationAt = recent[0]?.createdAt ?? null
  } catch {
    recent = null
  }

  let refunds7d: number | null = null
  try {
    const { data } = await getStripe().refunds.list({ limit: 10 })
    refunds7d = data.filter((refund) => now.getTime() - refund.created * 1000 <= 7 * DAY_MS).length
  } catch {
    refunds7d = null
  }

  return { mode, gauge, recent, refunds7d, lastDonationAt }
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

/* ────────────────────────── Travail éditorial (3.8) ────────────────────────── */

export type EditorialCountsData =
  | { state: 'ok'; aParaitre: number; sansCouverture: number; sansIsbn: number; sansPrix: number }
  | { state: 'na' }

/** 4 compteurs de complétude catalogue — chacun a son lien profond vers la liste filtrée côté rendu. */
export async function readEditorialCounts(payload: Payload): Promise<EditorialCountsData> {
  try {
    const [aParaitre, sansCouverture, sansIsbn, sansPrix] = await Promise.all([
      payload.count({ collection: 'books', where: { aParaitre: { equals: true } }, overrideAccess: true }),
      payload.count({ collection: 'books', where: { cover: { exists: false } }, overrideAccess: true }),
      payload.count({
        collection: 'books',
        where: { or: [{ isbn: { exists: false } }, { isbn: { equals: '' } }] },
        overrideAccess: true,
      }),
      payload.count({ collection: 'books', where: { prix: { exists: false } }, overrideAccess: true }),
    ])
    return {
      state: 'ok',
      aParaitre: aParaitre.totalDocs,
      sansCouverture: sansCouverture.totalDocs,
      sansIsbn: sansIsbn.totalDocs,
      sansPrix: sansPrix.totalDocs,
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Quoi de neuf (3.9) ────────────────────────── */

export interface RecentBookRow {
  id: number
  title: string
  edition: string | null
  updatedAt: string
}

export type RecentBooksData = { state: 'ok'; books: RecentBookRow[] } | { state: 'na' }

/** 5 dernières fiches modifiées (`-updatedAt`). */
export async function readRecentBooks(payload: Payload): Promise<RecentBooksData> {
  try {
    const { docs } = await payload.find({
      collection: 'books',
      sort: '-updatedAt',
      depth: 0,
      limit: 5,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      books: docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        edition: doc.edition ?? null,
        updatedAt: doc.updatedAt,
      })),
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
 * réseau de `src/lib` est fermé (catalogue-http/boutique/donations
 * uniquement, cf. `src/lib/CLAUDE.md`).
 *
 * `cache()` : le bandeau (`Dashboard`, beforeDashboard) et le panneau 3.12
 * (`DashboardFooter`, afterDashboard) lisent le même signal dans la même
 * requête — une seule exécution. Fraîcheur : `revalidate: 180` (spec §3.12,
 * fenêtre 120-300 s).
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
  /**
   * Bloc de transition — non-`null` UNIQUEMENT tant que
   * `CATALOGUE_SOURCE !== 'pg'`. Simple test à supprimer (avec son rendu)
   * une fois la bascule confirmée stable — jamais un flag long terme
   * (design v2 §5, panneaux transitoires).
   */
  transition: {
    catalogueSourceLabel: string
    wpEs: boolean
    wpLd: boolean
    wcStore: boolean
  } | null
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
    transition:
      process.env.CATALOGUE_SOURCE !== 'pg'
        ? {
            catalogueSourceLabel: "l'ancien système (WordPress)",
            wpEs: Boolean(process.env.WP_ES_URL),
            wpLd: Boolean(process.env.WP_LD_URL),
            wcStore: Boolean(process.env.WC_STORE_URL),
          }
        : null,
  }
}
