import { cache } from 'react'

import type { Payload } from 'payload'

import {
  precommandeQuantityByBook,
  quantitySoldByBook,
  rollingWindows,
  splitPromos,
  STOCK_SEUIL_FALLBACK,
  stockOutlook,
  type SalesHistoryRow,
  type SalesWindowRow,
  type StockOutlookRow,
} from './derive.ts'
import { parseStoredImportReport } from '../../lib/import-run-report-core.ts'
import { brevoConfigured, getNewsletterListStats } from '../../../lib/brevo.ts'
import { getCampaign2026 } from '../../../lib/donations.ts'
import { isoDayParis, monthsAgoParisMonthStartUtc, parisMidnightUtc } from '../../../lib/format.ts'
import { getActiveHighlight } from '../../../lib/highlight.ts'
import { upcomingBoundaryUtc } from '../../../lib/sellability.ts'

/**
 * Lecteurs I/O du dashboard `/admin` (refonte : bandeau KPI → graphique
 * ventes → dernières commandes → bloc « En cours » → raccourcis) — Local API
 * Payload, Stripe (`donations.ts`) et API Sentry. Règle du chantier : chaque
 * lecteur attrape TOUT et dégrade en `{ state: 'na' }` — le RSC appelant ne
 * plante jamais.
 *
 * `readSalesWindow` est la lecture UNIQUE des ventes 60 j (statuts
 * paid/prepared/shipped) : elle nourrit à elle seule le KPI 30 j, le
 * graphique, les précommandes payées par titre (`readUpcomingBooks`) et la
 * vélocité stock (`readStockOutlook`) — les dérivations pures sur son
 * résultat vivent dans `derive.ts`, jamais une requête Payload par usage.
 * `readSalesHistory` est sa cousine ~13 mois (mois courant + 12 précédents,
 * plus bas) pour la future page `/admin/ventes` (KPIs multi-fenêtres, seaux
 * mensuels, top titres) — une lecture distincte, PAS un simple élargissement
 * de `readSalesWindow` : la forme de ligne diffère (`titleSnapshot`/
 * `unitPriceTTC` par ligne plutôt que `book`, nécessaires à l'agrégation par
 * titre) et l'usage (page dédiée) ne recoupe pas la home.
 * Les dérivations pures (états, seuils, bornes) vivent dans `derive.ts` ; le
 * rendu dans `Dashboard.tsx` (home) et `../health/HealthPage.tsx`/
 * `../stock/StockPage.tsx` (vues admin-only, hors périmètre de cet agent).
 *
 * NB requêtes commandes : `orders.status` est indexé (migration
 * `20260717_150000_orders_status_index`).
 */

/* ────────────────────────── Ventes — lecture unique 60 j (KPI/graphique/vélocité) ────────────────────────── */

export type SalesWindowData = { state: 'ok'; rows: SalesWindowRow[] } | { state: 'na' }

/**
 * Commandes vendues des 60 derniers jours (statuts `paid`/`prepared`/
 * `shipped` — jamais `refunded`/`cancelled`/`failed`, l'historique Woo porte
 * ~45 k€ d'annulées avec `totalTTC` non nul). `paidAt` à défaut `createdAt`
 * pour la borne (les deux posés au même moment en pratique par le webhook,
 * même convention que l'ancien `readWorkOrders`). AUCUN filtre `orderType`
 * ici (les dons ont aussi un statut `paid`/`prepared`/`shipped`) — l'étanchéité
 * comptable dons/ventes est appliquée en aval, dans les dérivations pures
 * (`salesStats`/`dailySalesBuckets`), pas dans cette lecture partagée par la
 * vélocité stock qui, elle, compte les dons (cf. `quantitySoldByBook`).
 *
 * Select API (issue #68) : `lines` entier plutôt qu'une sélection imbriquée
 * (`lines: { quantity: true, book: true }`) — Payload ne garantit pas le
 * pruning au niveau SQL pour un champ `array` (contrairement à un `group`,
 * cf. `shippingAddress: { fullName: true }` de `readWorkOrders`, éprouvé) ; on économise
 * le risque et on ne conserve que `quantity`/`book` à la sortie.
 */
export async function readSalesWindow(payload: Payload, now: Date): Promise<SalesWindowData> {
  const { start60 } = rollingWindows(now)
  try {
    const { docs } = await payload.find({
      collection: 'orders',
      where: {
        and: [
          {
            or: [
              { paidAt: { greater_than_equal: start60.toISOString() } },
              {
                and: [
                  { paidAt: { exists: false } },
                  { createdAt: { greater_than_equal: start60.toISOString() } },
                ],
              },
            ],
          },
          { status: { in: ['paid', 'prepared', 'shipped'] } },
        ],
      },
      select: { paidAt: true, createdAt: true, totalTTC: true, orderType: true, lines: true },
      sort: 'createdAt',
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      rows: docs.map((doc) => ({
        paidAt: doc.paidAt ?? null,
        createdAt: doc.createdAt,
        totalTTC: doc.totalTTC,
        orderType: doc.orderType,
        lines: (doc.lines ?? []).map((line) => ({
          quantity: line.quantity,
          book: typeof line.book === 'number' ? line.book : line.book.id,
        })),
      })),
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Ventes — historique 13 mois (page /admin/ventes) ────────────────────────── */

export type SalesHistoryData = { state: 'ok'; rows: SalesHistoryRow[] } | { state: 'na' }

/**
 * Lecture UNIQUE des ventes ~13 mois civils Paris (mois courant + 12
 * précédents, `monthsAgoParisMonthStartUtc(now, 12)`, `derive.ts`) — nourrira
 * à elle seule la future page `/admin/ventes` (KPIs multi-fenêtres, seaux
 * mensuels, top titres : `derive.ts:windowSalesStats`/`monthlySalesBuckets`/
 * `topTitles`), jamais une requête Payload par usage — même principe que
 * `readSalesWindow` ci-dessus, sur une fenêtre plus large et avec un besoin
 * différent en aval (agrégation par titre plutôt que par livre).
 *
 * Mêmes statuts vendus que `readSalesWindow` (`paid`/`prepared`/`shipped`,
 * jamais `refunded`/`cancelled`/`failed`) et même convention de borne
 * (`paidAt` à défaut `createdAt`). AUCUN filtre `orderType` ici (les dons ont
 * aussi un statut `paid`/`prepared`/`shipped`) — l'étanchéité comptable
 * dons/ventes est appliquée en aval, dans les dérivations pures
 * (`windowSalesStats`/`monthlySalesBuckets`/`topTitles`), pas dans cette
 * lecture partagée.
 *
 * Select API (issue #68) : `lines` gardé ENTIER plutôt qu'une sélection
 * imbriquée (`lines: { quantity: true, titleSnapshot: true, unitPriceTTC:
 * true }`) — même réserve documentée ci-dessus pour `readSalesWindow`/
 * `readWorkOrders`/`readPreorderTotals` : Payload ne garantit pas le pruning
 * SQL d'un champ `array` (contrairement à un `group`), donc pas de gain de
 * coût garanti à demander une forme imbriquée pour lui ; on ne conserve que
 * `quantity`/`titleSnapshot`/`unitPriceTTC` à la sortie. Avec l'historique
 * Woo, cette lecture porte sur environ 7 000 commandes : le select minimal
 * sur les champs racine (`paidAt`/`createdAt`/`totalTTC`/`orderType`, pas de
 * `number`/adresse/Stripe) reste le vrai levier de coût.
 */
export async function readSalesHistory(payload: Payload, now: Date): Promise<SalesHistoryData> {
  const start = monthsAgoParisMonthStartUtc(now, 12)
  try {
    const { docs } = await payload.find({
      collection: 'orders',
      where: {
        and: [
          {
            or: [
              { paidAt: { greater_than_equal: start.toISOString() } },
              {
                and: [
                  { paidAt: { exists: false } },
                  { createdAt: { greater_than_equal: start.toISOString() } },
                ],
              },
            ],
          },
          { status: { in: ['paid', 'prepared', 'shipped'] } },
        ],
      },
      select: { paidAt: true, createdAt: true, totalTTC: true, orderType: true, lines: true },
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      rows: docs.map((doc) => ({
        paidAt: doc.paidAt ?? null,
        createdAt: doc.createdAt,
        totalTTC: doc.totalTTC,
        orderType: doc.orderType,
        lines: (doc.lines ?? []).map((line) => ({
          quantity: line.quantity,
          titleSnapshot: line.titleSnapshot,
          unitPriceTTC: line.unitPriceTTC,
        })),
      })),
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Commandes à traiter ────────────────────────── */

export interface WorkOrderRow {
  id: number
  number: string
  fullName: string
  status: string
  createdAt: string
  paidAt: string | null
  totalTTC: number
  shippingMethod: 'standard' | 'reduit' | 'offert'
  lines: { titleSnapshot: string; quantity: number }[]
}

export type WorkOrdersData =
  | { state: 'ok'; orders: WorkOrderRow[]; totalPending: number }
  | { state: 'na' }

/**
 * Commandes à traiter — les 4 plus récentes (`totalPending` porte le total
 * réel de la file, potentiellement supérieur). Décision client (plus de
 * police des flux) : exclut désormais l'historique Woo ET les précommandes.
 *
 * - Historique Woo : `number` natif est TOUJOURS préfixé `CMD-######`
 *   (`order-number.ts:formatOrderNumber`) ; un numéro Woo importé est
 *   purement numérique (`number` = n° Woo brut, jamais `CMD-*`, cf. CLAUDE.md
 *   racine). Filtre choisi : `number: { contains: 'CMD' }` — `contains` sur
 *   Postgres se traduit en `ILIKE '%CMD%'` (`@payloadcms/drizzle:
 *   operatorMap`), donc en substring simple, contrairement à l'opérateur
 *   `like` qui découpe la valeur en mots ; pas besoin d'un second filtre
 *   `stripeSessionId not_like 'woo-'` — les 535 commandes `paid` de
 *   l'historique n'ont jamais ce préfixe.
 * - Précommandes (`orderType: 'precommande'`) : rien à expédier avant
 *   parution — comptées à part par `readPendingPreorders`.
 */
export async function readWorkOrders(payload: Payload): Promise<WorkOrdersData> {
  try {
    const { docs, totalDocs } = await payload.find({
      collection: 'orders',
      where: {
        and: [
          { status: { in: ['paid', 'prepared'] } },
          { orderType: { not_equals: 'precommande' } },
          { number: { contains: 'CMD' } },
        ],
      },
      // Select API (issue #68) : la ligne de travail n'affiche que ces
      // champs — pas les coordonnées client complètes, les identifiants
      // Stripe, etc. `shippingAddress` est un `group` (pruning imbriqué
      // éprouvé, cf. `readWorkOrders`) ; `lines`, en `array`, reste entier
      // (même réserve que `readSalesWindow`).
      select: {
        number: true,
        status: true,
        createdAt: true,
        paidAt: true,
        totalTTC: true,
        shippingMethod: true,
        lines: true,
        shippingAddress: { fullName: true },
      },
      sort: '-createdAt',
      depth: 0,
      limit: 4,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      orders: docs.map((doc) => ({
        id: doc.id,
        number: doc.number ?? `#${doc.id}`,
        fullName: doc.shippingAddress?.fullName || '—',
        status: doc.status,
        createdAt: doc.createdAt,
        paidAt: doc.paidAt ?? null,
        totalTTC: doc.totalTTC,
        shippingMethod: doc.shippingMethod,
        lines: (doc.lines ?? []).map((line) => ({
          titleSnapshot: line.titleSnapshot,
          quantity: line.quantity,
        })),
      })),
      totalPending: totalDocs,
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Précommandes en attente (comptées à part) ────────────────────────── */

export type PendingPreordersData = { state: 'ok'; count: number } | { state: 'na' }

/**
 * Précommandes payées/préparées — comptage seul (bloc « En cours »), jamais
 * dans la file de travail : rien à expédier avant la parution du titre.
 * Mêmes filtres anti-historique-Woo que `readWorkOrders`.
 */
export async function readPendingPreorders(payload: Payload): Promise<PendingPreordersData> {
  try {
    const { totalDocs } = await payload.count({
      collection: 'orders',
      where: {
        and: [
          { orderType: { equals: 'precommande' } },
          { status: { in: ['paid', 'prepared'] } },
          { number: { contains: 'CMD' } },
        ],
      },
      overrideAccess: true,
    })
    return { state: 'ok', count: totalDocs }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Vue d'ensemble stock + vélocité (page /admin/stock) ────────────────────────── */

export type StockOutlookData = { state: 'ok'; rows: StockOutlookRow[] } | { state: 'na' }

/**
 * Vue d'ensemble stock/vélocité — livres vendables, non à paraître, combinés
 * à la vélocité 30 j (réducteur pur `quantitySoldByBook` sur
 * `readSalesWindow`, PAS de requête supplémentaire). La home affiche
 * `urgentStockRows` sur ce même résultat (cap 4, côté rendu — vague 2).
 * `salesWindow` doit venir d'un appel préalable à `readSalesWindow` (même
 * fenêtre partagée par le KPI et le graphique) — un état `na` dégrade
 * silencieusement en vélocité 0 partout (jamais un plantage de la page stock
 * pour un incident qui ne touche que les ventes).
 */
export async function readStockOutlook(
  payload: Payload,
  salesWindow: SalesWindowData,
  now: Date,
): Promise<StockOutlookData> {
  try {
    const { docs } = await payload.find({
      collection: 'books',
      where: {
        and: [
          { 'commerce.sellable': { equals: true } },
          // « Non à paraître » dérivé de la date de parution (borne
          // `upcomingBoundaryUtc`, `sellability.ts`) — fiche sans date
          // comptée parue, comme `isUpcoming(null)`.
          {
            or: [
              { dateParution: { less_than: upcomingBoundaryUtc(now) } },
              { dateParution: { exists: false } },
            ],
          },
        ],
      },
      select: { title: true, edition: true, commerce: { stock: true, stockSuivi: true } },
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    const soldByBook =
      salesWindow.state === 'ok' ? quantitySoldByBook(salesWindow.rows, now) : new Map<number, number>()
    const inputs = docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      edition: doc.edition ?? null,
      stock: doc.commerce?.stock ?? null,
      stockSuivi: doc.commerce?.stockSuivi ?? null,
    }))
    return { state: 'ok', rows: stockOutlook(inputs, soldByBook, now) }
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

/* ────────────────────────── Codes promo — vue d'ensemble (3.11) ────────────────────────── */

export interface PromoOverviewRow {
  id: number
  code: string
  label: string
  expiresAt: string | null
  usage: number
}

export type PromosOverviewData =
  | { state: 'ok'; live: PromoOverviewRow[]; expiredActive: PromoOverviewRow[]; totalLive: number }
  | { state: 'na' }

/**
 * Codes actifs répartis live/expirés-encore-actifs (`splitPromos`) — cap 4
 * `live` (+ lien « voir tout », `totalLive` porte le total réel) et TOUTES
 * les `expiredActive` (peu nombreuses, appellent une action immédiate,
 * jamais tronquées). `usage` = nb de commandes ayant appliqué le code, un
 * `count` par code RETENU seulement (jamais tous les codes actifs).
 * Remplace l'ancien `readExpiredPromos` (superset : live + expirées + usage).
 */
export async function readPromosOverview(payload: Payload, now: Date): Promise<PromosOverviewData> {
  try {
    const { docs } = await payload.find({
      collection: 'promo-codes',
      where: { active: { equals: true } },
      // `active` fait partie du select bien que déjà garanti par le `where` :
      // `splitPromos` (dérivation pure, réutilisable ailleurs) en a besoin
      // pour son prédicat — un select sans lui renverrait des docs SANS le
      // champ, et `promo.active !== true` (undefined) exclurait tout à tort.
      select: { code: true, type: true, amount: true, minCart: true, expiresAt: true, active: true },
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    const { live, expiredActive } = splitPromos(docs, now)
    const liveShown = live.slice(0, 4)
    const retained = [...liveShown, ...expiredActive]

    const rows = await Promise.all(
      retained.map(async (doc) => {
        const { totalDocs: usage } = await payload.count({
          collection: 'orders',
          where: { promoCode: { equals: doc.id } },
          overrideAccess: true,
        })
        const label =
          doc.type === 'free_shipping'
            ? doc.minCart
              ? `Livraison offerte dès ${doc.minCart} €`
              : 'Livraison offerte'
            : `${doc.amount ?? 0} €`
        return { id: doc.id, code: doc.code, label, expiresAt: doc.expiresAt ?? null, usage }
      }),
    )

    return {
      state: 'ok',
      live: rows.slice(0, liveShown.length),
      expiredActive: rows.slice(liveShown.length),
      totalLive: live.length,
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Mise en avant active (bandeau home) ────────────────────────── */

export type ActiveHighlightData =
  | {
      state: 'ok'
      highlight: { id: number; titre: string; dateDebut: string; dateFin: string; lien: string | null } | null
    }
  | { state: 'na' }

/**
 * Mise en avant active — réutilise `getActiveHighlight` (`src/lib/highlight.ts`,
 * déjà tout le filtre actif+date) plutôt que de relire `highlight` ici : une
 * seule source de vérité pour « quelle mise en avant est active en ce
 * moment », front public et back-office alignés. Signature réelle SANS
 * argument `payload` (sa propre connexion Local API, comme le front) — le
 * `payload` du RSC appelant n'est donc pas réutilisé ici, contrairement aux
 * autres lecteurs de ce fichier ; `getActiveHighlight` dégrade déjà en `null`
 * sur toute erreur, le `try/catch` ci-dessous est une ceinture-bretelles
 * (convention du chantier : chaque lecteur attrape TOUT lui-même).
 */
export async function readActiveHighlightPanel(): Promise<ActiveHighlightData> {
  try {
    const highlight = await getActiveHighlight()
    return {
      state: 'ok',
      highlight: highlight
        ? {
            id: highlight.id,
            titre: highlight.titre,
            dateDebut: highlight.dateDebut,
            dateFin: highlight.dateFin,
            lien: highlight.lien ?? null,
          }
        : null,
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Jauge de dons 2026 (bloc « En cours ») ────────────────────────── */

export type SouscriptionJaugeData =
  | { state: 'ok'; total: number; objectif: number; pourcentage: number; count: number }
  | { state: 'na' }

/**
 * Jauge de dons 2026 — enveloppe `getCampaign2026()` (`src/lib/donations.ts`,
 * Stripe Search API, zéro stockage). `null` (avant ouverture de la
 * campagne, Stripe indisponible, réponse malformée) → gris, jamais un faux 0
 * — même contrat que `/souscription`.
 */
export async function readSouscriptionJauge(): Promise<SouscriptionJaugeData> {
  try {
    const campaign = await getCampaign2026()
    if (!campaign) return { state: 'na' }
    return {
      state: 'ok',
      total: campaign.collected,
      objectif: campaign.goal,
      pourcentage: campaign.percentOfGoal,
      count: campaign.contributors,
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Livres à paraître (bloc « En cours ») ────────────────────────── */

export interface UpcomingBookRow {
  id: number
  title: string
  edition: string | null
  dateParution: string
  preorder: boolean
  precommandesPayees: number
}

export type UpcomingBooksData = { state: 'ok'; books: UpcomingBookRow[]; totalDocs: number } | { state: 'na' }

/**
 * Livres à paraître — 4 prochains par date de parution. `precommandesPayees`
 * vient du réducteur pur `precommandeQuantityByBook` sur `readSalesWindow`
 * (fenêtre glissante 30 j — PAS le total vie entière d'une campagne de
 * précommande ouverte plus tôt, cf. `derive.ts`), jamais une requête `orders`
 * par livre. `salesWindow` doit venir d'un appel préalable à
 * `readSalesWindow` ; un état `na` dégrade en 0 précommande affichée pour
 * chaque titre plutôt que de faire échouer tout le bloc.
 */
export async function readUpcomingBooks(
  payload: Payload,
  salesWindow: SalesWindowData,
  now: Date,
): Promise<UpcomingBooksData> {
  try {
    const { docs, totalDocs } = await payload.find({
      collection: 'books',
      // « À paraître » = `dateParution` strictement future (borne
      // `upcomingBoundaryUtc`, même règle que le front) — plus aucune
      // checkbox manuelle depuis la migration `20260821_170000`.
      where: { dateParution: { greater_than_equal: upcomingBoundaryUtc(now) } },
      select: { title: true, edition: true, dateParution: true, commerce: { preorder: true } },
      sort: 'dateParution',
      depth: 0,
      limit: 4,
      overrideAccess: true,
    })
    const byBook =
      salesWindow.state === 'ok'
        ? precommandeQuantityByBook(salesWindow.rows, now)
        : new Map<number, number>()
    return {
      state: 'ok',
      books: docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        edition: doc.edition ?? null,
        dateParution: doc.dateParution,
        preorder: Boolean(doc.commerce?.preorder),
        precommandesPayees: byBook.get(doc.id) ?? 0,
      })),
      totalDocs,
    }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Précommandes — total vie entière (bloc « En cours ») ────────────────────────── */

export type PreorderTotalsData = { state: 'ok'; totalByBook: Map<number, number> } | { state: 'na' }

/**
 * Précommandes payées/préparées/expédiées, quantité totale par livre, SANS
 * fenêtre temporelle — complète `precommandeQuantityByBook` (`derive.ts`,
 * fenêtre glissante 30 j) qui SOUS-COMPTE une campagne de précommande ouverte
 * avant la fenêtre : ce lecteur ne fenêtre rien, juste `orderType:
 * 'precommande'` sur les 3 statuts vendus, somme vie entière de la campagne.
 * Nourrit l'affichage « N précommandes payées » du bloc « Prochaines
 * parutions » (`Dashboard.tsx`), qui retombe sur `UpcomingBookRow.precommandesPayees`
 * (fenêtré 30 j, déjà zéro-safe) si ce lecteur est `na` — jamais un zéro
 * inventé, juste un repli sur une valeur déjà sûre.
 *
 * Select API (issue #68) : `lines` entier plutôt qu'une sélection imbriquée
 * (`lines: { book: true, quantity: true }`) — même réserve que
 * `readSalesWindow` ci-dessus (Payload ne garantit pas le pruning SQL d'un
 * champ `array`) ; on ne conserve que `book`/`quantity` à la sortie. Pas de
 * réducteur pur de `derive.ts` réutilisable tel quel ici
 * (`sumQuantityByBookInWindow` fenêtre par date ; ce lecteur, lui, ne fenêtre
 * rien) : la somme par livre est donc faite à la main, ci-dessous.
 */
export async function readPreorderTotals(payload: Payload): Promise<PreorderTotalsData> {
  try {
    const { docs } = await payload.find({
      collection: 'orders',
      where: {
        and: [
          { orderType: { equals: 'precommande' } },
          { status: { in: ['paid', 'prepared', 'shipped'] } },
        ],
      },
      select: { lines: true },
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    const totalByBook = new Map<number, number>()
    for (const doc of docs) {
      for (const line of doc.lines ?? []) {
        const book = typeof line.book === 'number' ? line.book : line.book.id
        totalByBook.set(book, (totalByBook.get(book) ?? 0) + line.quantity)
      }
    }
    return { state: 'ok', totalByBook }
  } catch {
    return { state: 'na' }
  }
}

/* ────────────────────────── Rencontres à venir (bloc « En cours ») ────────────────────────── */

export interface UpcomingRencontreRow {
  id: number
  titre: string
  date: string
  ville: string
  lieu: string
}

export type UpcomingRencontresData =
  | { state: 'ok'; rencontres: UpcomingRencontreRow[]; totalDocs: number }
  | { state: 'na' }

/**
 * Rencontres à venir — 4 prochaines par date. Borne « aujourd'hui » en jour
 * CIVIL PARIS : `date` (`dayOnly`) stocke minuit Paris en UTC —
 * `parisMidnightUtc(isoDayParis(now))` (même calcul que `splitRencontres`/
 * `getRencontres` de `src/lib/rencontres.ts`), jamais un `now.toISOString()`
 * brut qui basculerait un événement du jour même en « passé » dès minuit UTC
 * au lieu de minuit heure française.
 */
export async function readUpcomingRencontres(payload: Payload, now: Date): Promise<UpcomingRencontresData> {
  try {
    const today = isoDayParis(now) ?? now.toISOString().slice(0, 10)
    const { docs, totalDocs } = await payload.find({
      collection: 'rencontres',
      where: { date: { greater_than_equal: parisMidnightUtc(today) } },
      select: { titre: true, date: true, ville: true, lieu: true },
      sort: 'date',
      depth: 0,
      limit: 4,
      overrideAccess: true,
    })
    return {
      state: 'ok',
      rencontres: docs.map((doc) => ({
        id: doc.id,
        titre: doc.titre,
        date: doc.date,
        ville: doc.ville,
        lieu: doc.lieu,
      })),
      totalDocs,
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

/* ────────────────────────── Newsletter (bloc « En cours ») ────────────────────────── */

export type NewsletterCountData = { state: 'ok'; totalSubscribers: number } | { state: 'na' }

/**
 * Effectif de la liste newsletter. CONTRAT D'INTERFACE : `getNewsletterListStats`
 * est écrit par un autre agent en parallèle dans `src/lib/brevo.ts` (symbole
 * absent au moment où ce lecteur est écrit — attendu :
 * `export async function getNewsletterListStats(): Promise<{ ok: true;
 * totalSubscribers: number } | { ok: false }>`, résolu à la vérification
 * finale du chantier, pas ici). `ok: false` (clé Brevo absente, API en échec)
 * → `na`, jamais un throw ni un faux 0. `cache()` : même modèle que
 * `readSentryIssues` (mémoïsation par requête).
 */
export const readNewsletterCount = cache(async (): Promise<NewsletterCountData> => {
  try {
    const result = await getNewsletterListStats()
    return result.ok ? { state: 'ok', totalSubscribers: result.totalSubscribers } : { state: 'na' }
  } catch {
    return { state: 'na' }
  }
})

/* ────────────────────────── Configuration & accès (3.13) ────────────────────────── */

export interface ConfigData {
  /** Présence + mode — jamais la valeur. */
  stripeMode: 'live' | 'test' | 'absent'
  sentryBuildToken: boolean
  sentryDashboardToken: boolean
  databaseUrl: boolean
  /**
   * `BREVO_API_KEY` posée — donc chaîne e-mail active. Fausse, AUCUN e-mail ne
   * part (contact, newsletter, récapitulatif de commande) et le site bascule
   * sur son repli manuel. Lu par `brevoConfigured()` (`src/lib/brevo.ts`),
   * jamais réécrit ici : c'est ce même prédicat qui aiguille le front.
   */
  brevoKey: boolean
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
    brevoKey: brevoConfigured(),
    lockedAccounts,
  }
}
