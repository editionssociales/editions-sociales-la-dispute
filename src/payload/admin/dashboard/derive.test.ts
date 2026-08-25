import { describe, expect, it } from 'vitest'

import {
  bannerHidden,
  bucketWeeklyQuantities,
  chartAxisTicks,
  dailySalesBuckets,
  editionTag,
  everyNthLabels,
  fmtDateFr,
  fmtDateTimeFr,
  fmtDayMonthFr,
  fmtEuros,
  fmtEurosAxis,
  humanAge,
  IMPORT_ALERT_DAYS,
  importSignal,
  monthlyBucketToChartInput,
  monthlySalesBuckets,
  monthsAgoParisMonthStartUtc,
  parisMonthBounds,
  pastilleText,
  precommandeQuantityByBook,
  quantitySoldByBook,
  rollingWindows,
  salesChartGeometry,
  salesStats,
  sentryErrorEvents,
  sentrySignal,
  splitPromos,
  STOCK_SEUIL_FALLBACK,
  stockOutlook,
  stockRowState,
  stockSignal,
  summarizeLines,
  topTitles,
  urgentStockRows,
  windowSalesStats,
  worstState,
  type BannerItem,
  type DailySalesBucket,
  type DatedQuantity,
  type SalesHistoryRow,
  type SalesWindowRow,
  type StockOutlookInput,
  type StockOutlookRow,
  type SummarizableLine,
} from './derive.ts'

const DAY_MS = 86_400_000

/** Espaces insécables (fine ou pleine) → espace simple : les assertions ne dépendent pas de la version d'ICU. */
function plain(s: string): string {
  return s.replace(/[  ]/g, ' ')
}

/* ────────────────────────── worstState ────────────────────────── */

describe('worstState', () => {
  it('alerte > attention > gris > OK', () => {
    expect(worstState(['ok', 'na', 'warn', 'alert'])).toBe('alert')
    expect(worstState(['ok', 'na', 'warn'])).toBe('warn')
    expect(worstState(['ok', 'na'])).toBe('na')
    expect(worstState(['ok', 'ok'])).toBe('ok')
    expect(worstState([])).toBe('ok')
  })
})

describe('stock bas', () => {
  it('un titre à 0 : alerte du panneau, badge « indisponible en ligne » sur la ligne', () => {
    expect(stockSignal([0, 2])).toBe('alert')
    expect(stockRowState(0)).toBe('alert')
  })

  it('des titres sous le seuil sans épuisé : attention', () => {
    expect(stockSignal([1, STOCK_SEUIL_FALLBACK])).toBe('warn')
    expect(stockRowState(1)).toBe('warn')
  })

  it('aucun titre sous le seuil : OK (le panneau reste affiché, c’est le signal qui est vert)', () => {
    expect(stockSignal([])).toBe('ok')
  })
})

/* ────────────────────────── Ventes — KPI 30 j + graphique ────────────────────────── */

function salesRow(overrides: Partial<SalesWindowRow> = {}): SalesWindowRow {
  return {
    paidAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    totalTTC: 20,
    orderType: 'commande',
    lines: [{ quantity: 1, book: 1 }],
    ...overrides,
  }
}

describe('rollingWindows', () => {
  it('30 j / 60 j en arrière, arithmétique ms simple', () => {
    const now = new Date('2026-08-30T12:00:00Z')
    const { start30, start60 } = rollingWindows(now)
    expect(start30.toISOString()).toBe(new Date(now.getTime() - 30 * DAY_MS).toISOString())
    expect(start60.toISOString()).toBe(new Date(now.getTime() - 60 * DAY_MS).toISOString())
  })
})

describe('salesStats — fenêtre glissante 30 j vs 30 j précédents', () => {
  const now = new Date('2026-08-30T12:00:00Z')
  const { start30, start60 } = rollingWindows(now)

  it('une commande dans la fenêtre courante alimente ca/nbCommandes/nbExemplaires', () => {
    const row = salesRow({
      createdAt: new Date(start30.getTime() + DAY_MS).toISOString(),
      totalTTC: 42,
      lines: [{ quantity: 2, book: 1 }, { quantity: 3, book: 2 }],
    })
    const stats = salesStats([row], now)
    expect(stats.ca).toBe(42)
    expect(stats.nbCommandes).toBe(1)
    expect(stats.nbExemplaires).toBe(5)
  })

  it('borne haute incluse : une commande exactement à `now` compte dans la fenêtre courante', () => {
    const row = salesRow({ createdAt: now.toISOString(), totalTTC: 10 })
    expect(salesStats([row], now).ca).toBe(10)
  })

  it('borne basse de la fenêtre courante incluse (exactement start30)', () => {
    const row = salesRow({ createdAt: start30.toISOString(), totalTTC: 10 })
    expect(salesStats([row], now).ca).toBe(10)
  })

  it('juste avant start30 : fenêtre précédente, pas la courante', () => {
    const row = salesRow({ createdAt: new Date(start30.getTime() - 1).toISOString(), totalTTC: 10 })
    const stats = salesStats([row], now)
    expect(stats.ca).toBe(0)
    expect(stats.nbCommandes).toBe(0)
  })

  it('borne basse de la fenêtre précédente incluse (exactement start60)', () => {
    const row = salesRow({ createdAt: start60.toISOString(), totalTTC: 10 })
    const stats = salesStats([row], now)
    expect(stats.ca).toBe(0)
    // deltaPct doit refléter la fenêtre précédente non vide.
    expect(stats.deltaPct).not.toBeNull()
  })

  it('avant start60 : hors des deux fenêtres, ignorée', () => {
    const row = salesRow({ createdAt: new Date(start60.getTime() - 1).toISOString(), totalTTC: 999 })
    expect(salesStats([row], now).deltaPct).toBeNull()
  })

  it('étanchéité comptable : un don est exclu de ca/nbCommandes/nbExemplaires même dans la fenêtre courante', () => {
    const row = salesRow({ createdAt: now.toISOString(), totalTTC: 100, orderType: 'don' })
    const stats = salesStats([row], now)
    expect(stats.ca).toBe(0)
    expect(stats.nbCommandes).toBe(0)
    expect(stats.nbExemplaires).toBe(0)
  })

  it('caPrecommande isole le CA des commandes `orderType: precommande` de la fenêtre courante', () => {
    const rows = [
      salesRow({ createdAt: now.toISOString(), totalTTC: 30, orderType: 'commande' }),
      salesRow({ createdAt: now.toISOString(), totalTTC: 15, orderType: 'precommande' }),
    ]
    const stats = salesStats(rows, now)
    expect(stats.ca).toBe(45)
    expect(stats.caPrecommande).toBe(15)
  })

  it('deltaPct null si la fenêtre précédente est à 0 (jamais une division par zéro/Infinity)', () => {
    const row = salesRow({ createdAt: now.toISOString(), totalTTC: 50 })
    expect(salesStats([row], now).deltaPct).toBeNull()
  })

  it('deltaPct positif/négatif calculé normalement', () => {
    const rows = [
      salesRow({ createdAt: now.toISOString(), totalTTC: 150 }),
      salesRow({ createdAt: new Date(start30.getTime() - DAY_MS).toISOString(), totalTTC: 100 }),
    ]
    expect(salesStats(rows, now).deltaPct).toBeCloseTo(50)
  })

  it('date illisible : ligne ignorée, jamais un plantage', () => {
    const row = salesRow({ createdAt: 'n/a', totalTTC: 999 })
    const stats = salesStats([row], now)
    expect(stats.ca).toBe(0)
    expect(stats.deltaPct).toBeNull()
  })

  it('paidAt prime sur createdAt quand présent', () => {
    const row = salesRow({
      paidAt: now.toISOString(),
      createdAt: new Date(start60.getTime() - DAY_MS).toISOString(),
      totalTTC: 77,
    })
    expect(salesStats([row], now).ca).toBe(77)
  })
})

function historyRow(overrides: Partial<SalesHistoryRow> = {}): SalesHistoryRow {
  return {
    paidAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    totalTTC: 20,
    orderType: 'commande',
    lines: [{ quantity: 1, titleSnapshot: 'Titre', unitPriceTTC: 20 }],
    ...overrides,
  }
}

describe('windowSalesStats — généralisation à une largeur de fenêtre paramétrable', () => {
  const now = new Date('2026-08-30T12:00:00Z')

  it('salesStats délègue à windowSalesStats(rows, 30, now) : résultats strictement identiques', () => {
    const rows = [
      salesRow({ createdAt: now.toISOString(), totalTTC: 42, lines: [{ quantity: 2, book: 1 }] }),
      salesRow({ createdAt: new Date(now.getTime() - 40 * DAY_MS).toISOString(), totalTTC: 10 }),
      salesRow({ createdAt: now.toISOString(), totalTTC: 15, orderType: 'don' }),
    ]
    expect(salesStats(rows, now)).toEqual(windowSalesStats(rows, 30, now))
  })

  it('fenêtre 7 j vs 7 j précédents (au lieu de 30/30) : une commande à -20 j est hors des deux fenêtres', () => {
    const rows = [
      salesRow({ createdAt: now.toISOString(), totalTTC: 100 }),
      salesRow({ createdAt: new Date(now.getTime() - 20 * DAY_MS).toISOString(), totalTTC: 50 }),
    ]
    const stats = windowSalesStats(rows, 7, now)
    expect(stats.ca).toBe(100)
    expect(stats.deltaPct).toBeNull() // -20 j est hors [now-14j, now-7j[ pour days=7
  })

  it('la même commande à -20 j entre dans la fenêtre précédente pour days=14', () => {
    const rows = [
      salesRow({ createdAt: now.toISOString(), totalTTC: 100 }),
      salesRow({ createdAt: new Date(now.getTime() - 20 * DAY_MS).toISOString(), totalTTC: 50 }),
    ]
    const stats = windowSalesStats(rows, 14, now)
    expect(stats.ca).toBe(100)
    expect(stats.deltaPct).toBeCloseTo(100)
  })

  it('étanchéité comptable dons/ventes préservée quelle que soit la largeur de fenêtre', () => {
    const rows = [salesRow({ createdAt: now.toISOString(), totalTTC: 999, orderType: 'don' })]
    expect(windowSalesStats(rows, 90, now).ca).toBe(0)
  })

  it('fenêtre précédente vide : deltaPct null quelle que soit la largeur', () => {
    const rows = [salesRow({ createdAt: now.toISOString(), totalTTC: 30 })]
    expect(windowSalesStats(rows, 90, now).deltaPct).toBeNull()
  })

  it('accepte aussi des lignes au format SalesHistoryRow (titleSnapshot/unitPriceTTC) — typage structurel', () => {
    const rows = [
      historyRow({ createdAt: now.toISOString(), totalTTC: 30, lines: [{ quantity: 3, titleSnapshot: 'A', unitPriceTTC: 10 }] }),
    ]
    const stats = windowSalesStats(rows, 30, now)
    expect(stats.ca).toBe(30)
    expect(stats.nbExemplaires).toBe(3)
  })
})

describe('dailySalesBuckets — 30 seaux quotidiens (jour civil Paris)', () => {
  it('série complète de 30 jours, du plus ancien au plus récent, jours sans vente à 0', () => {
    const now = new Date('2026-07-13T10:00:00Z')
    const buckets = dailySalesBuckets([], now)
    expect(buckets).toHaveLength(30)
    expect(buckets.every((b) => b.ca === 0)).toBe(true)
    expect(buckets[29].day <= '2026-07-13').toBe(true)
    expect(buckets[0].day < buckets[29].day).toBe(true)
  })

  it('agrège plusieurs ventes du même jour civil Paris dans le même seau', () => {
    const now = new Date('2026-07-13T10:00:00Z')
    const rows = [
      salesRow({ createdAt: '2026-07-13T09:00:00Z', totalTTC: 10 }),
      salesRow({ createdAt: '2026-07-13T20:00:00Z', totalTTC: 5 }),
    ]
    const buckets = dailySalesBuckets(rows, now)
    const today = buckets[buckets.length - 1]
    expect(today.day).toBe('2026-07-13')
    expect(today.ca).toBe(15)
  })

  it('une vente hors fenêtre (plus de 30 jours) n’apparaît dans aucun seau', () => {
    const now = new Date('2026-07-13T10:00:00Z')
    const rows = [salesRow({ createdAt: '2026-01-01T00:00:00Z', totalTTC: 999 })]
    const buckets = dailySalesBuckets(rows, now)
    expect(buckets.reduce((sum, b) => sum + b.ca, 0)).toBe(0)
  })

  it('étanchéité comptable : un don n’apparaît dans aucun seau', () => {
    const now = new Date('2026-07-13T10:00:00Z')
    const rows = [salesRow({ createdAt: now.toISOString(), totalTTC: 500, orderType: 'don' })]
    expect(dailySalesBuckets(rows, now).reduce((sum, b) => sum + b.ca, 0)).toBe(0)
  })
})

describe('salesChartGeometry — géométrie des barres', () => {
  const dims = { width: 300, height: 100 }

  it('série vide : aucune barre', () => {
    expect(salesChartGeometry([], dims)).toEqual([])
  })

  it('tous les seaux à 0 : barres de hauteur 0, jamais de NaN', () => {
    const buckets: DailySalesBucket[] = [
      { day: '2026-07-01', ca: 0 },
      { day: '2026-07-02', ca: 0 },
    ]
    const bars = salesChartGeometry(buckets, dims)
    expect(bars.every((b) => b.h === 0 && !Number.isNaN(b.h))).toBe(true)
    expect(bars.every((b) => b.y === dims.height)).toBe(true)
  })

  it('le maximum touche la pleine hauteur', () => {
    const buckets: DailySalesBucket[] = [
      { day: '2026-07-01', ca: 10 },
      { day: '2026-07-02', ca: 40 },
    ]
    const bars = salesChartGeometry(buckets, dims)
    expect(bars[1].h).toBe(dims.height)
    expect(bars[1].y).toBe(0)
    expect(bars[0].h).toBe(25) // 10/40 * 100
  })

  it('largeur égale par seau, x cumulatif', () => {
    const buckets: DailySalesBucket[] = [
      { day: '2026-07-01', ca: 1 },
      { day: '2026-07-02', ca: 1 },
      { day: '2026-07-03', ca: 1 },
    ]
    const bars = salesChartGeometry(buckets, dims)
    expect(bars.map((b) => b.w)).toEqual([100, 100, 100])
    expect(bars.map((b) => b.x)).toEqual([0, 100, 200])
  })

  it('3ᵉ paramètre `maxValue` omis : comportement STRICTEMENT inchangé (défaut = maximum des seaux)', () => {
    const buckets: DailySalesBucket[] = [
      { day: '2026-07-01', ca: 10 },
      { day: '2026-07-02', ca: 40 },
    ]
    expect(salesChartGeometry(buckets, dims)).toEqual(salesChartGeometry(buckets, dims, undefined))
  })

  it('3ᵉ paramètre `maxValue` fourni : les barres sont mises à l’échelle de CETTE valeur, pas du maximum de la série', () => {
    const buckets: DailySalesBucket[] = [
      { day: '2026-07-01', ca: 10 },
      { day: '2026-07-02', ca: 40 },
    ]
    // axisMax = 50 (au lieu du maximum réel 40) : la barre à 40 ne touche plus le sommet.
    const bars = salesChartGeometry(buckets, dims, 50)
    expect(bars[1].h).toBe(80) // 40/50 * 100
    expect(bars[0].h).toBe(20) // 10/50 * 100
  })

  it('`maxValue` à 0 (aucune vente, axisMax de `chartAxisTicks` à 0) : barres de hauteur 0, jamais de NaN', () => {
    const buckets: DailySalesBucket[] = [{ day: '2026-07-01', ca: 0 }]
    const bars = salesChartGeometry(buckets, dims, 0)
    expect(bars[0].h).toBe(0)
    expect(Number.isNaN(bars[0].h)).toBe(false)
  })
})

describe('chartAxisTicks — graduations rondes 1-2-5×10ⁿ', () => {
  it('maxValue à 0 : axe dégénéré, jamais un NaN', () => {
    expect(chartAxisTicks(0)).toEqual({ ticks: [0], axisMax: 0 })
  })

  it('maxValue négatif : même repli que 0 (jamais un NaN)', () => {
    expect(chartAxisTicks(-5)).toEqual({ ticks: [0], axisMax: 0 })
  })

  it('7 → pas 2, axisMax 8', () => {
    expect(chartAxisTicks(7)).toEqual({ ticks: [0, 2, 4, 6, 8], axisMax: 8 })
  })

  it('148,5 → pas 50, axisMax 150 (« 150 € » rond)', () => {
    expect(chartAxisTicks(148.5)).toEqual({ ticks: [0, 50, 100, 150], axisMax: 150 })
  })

  it('4 210 → pas 2 000, axisMax 6 000', () => {
    expect(chartAxisTicks(4210)).toEqual({ ticks: [0, 2000, 4000, 6000], axisMax: 6000 })
  })

  it('100 000 → pas 50 000, axisMax 100 000 (déjà rond, moins de graduations que `targetCount`)', () => {
    expect(chartAxisTicks(100000)).toEqual({ ticks: [0, 50000, 100000], axisMax: 100000 })
  })

  it('`targetCount` personnalisable', () => {
    expect(chartAxisTicks(4210, 6)).toEqual({
      ticks: [0, 1000, 2000, 3000, 4000, 5000],
      axisMax: 5000,
    })
  })

  it('axisMax est toujours ≥ maxValue (jamais une barre qui dépasse la dernière ligne de grille)', () => {
    for (const v of [1, 7, 148.5, 999, 4210, 100000]) {
      expect(chartAxisTicks(v).axisMax).toBeGreaterThanOrEqual(v)
    }
  })
})

describe('everyNthLabels — indices de libellés d’axe X répartis', () => {
  it('série vide : aucun indice', () => {
    expect(everyNthLabels([])).toEqual([])
  })

  it('un seul élément : son indice seul', () => {
    expect(everyNthLabels(['a'])).toEqual([0])
  })

  it('n ≤ target : tous les indices (rien à répartir)', () => {
    expect(everyNthLabels(['a', 'b', 'c'], 5)).toEqual([0, 1, 2])
    expect(everyNthLabels(['a', 'b', 'c', 'd', 'e'], 5)).toEqual([0, 1, 2, 3, 4])
  })

  it('30 jours, target 5 : premier + dernier inclus, ~1 libellé/semaine', () => {
    const keys = Array.from({ length: 30 }, (_, i) => String(i))
    const indices = everyNthLabels(keys, 5)
    expect(indices[0]).toBe(0)
    expect(indices[indices.length - 1]).toBe(29)
    expect(indices).toEqual([0, 7, 15, 22, 29])
  })

  it('13 mois, target 5 : pas de 3 mois (~1/trimestre)', () => {
    const keys = Array.from({ length: 13 }, (_, i) => String(i))
    expect(everyNthLabels(keys, 5)).toEqual([0, 3, 6, 9, 12])
  })

  it('n grand (100), target 5 : premier + dernier inclus, indices strictement croissants (jamais de doublon adjacent)', () => {
    const keys = Array.from({ length: 100 }, (_, i) => String(i))
    const indices = everyNthLabels(keys, 5)
    expect(indices[0]).toBe(0)
    expect(indices[indices.length - 1]).toBe(99)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1])
    }
  })

  it('n juste au-dessus de target : jamais de doublon même si l’arrondi du pas pourrait en produire un', () => {
    const keys = Array.from({ length: 6 }, (_, i) => String(i))
    const indices = everyNthLabels(keys, 5)
    expect(new Set(indices).size).toBe(indices.length)
    expect(indices[0]).toBe(0)
    expect(indices[indices.length - 1]).toBe(5)
  })
})

/* ────────────────────────── Ventes — historique 13 mois (page /admin/ventes) ────────────────────────── */

describe('monthsAgoParisMonthStartUtc — borne basse mensuelle Paris', () => {
  it('12 mois avant août 2026 : 1er août 2025 minuit Paris (CEST, UTC-2)', () => {
    const start = monthsAgoParisMonthStartUtc(new Date('2026-08-30T12:00:00Z'), 12)
    expect(start.toISOString()).toBe('2025-07-31T22:00:00.000Z')
  })

  it('12 mois avant janvier 2026 : bascule d’année sur janvier 2025 (CET, UTC-1)', () => {
    const start = monthsAgoParisMonthStartUtc(new Date('2026-01-15T12:00:00Z'), 12)
    expect(start.toISOString()).toBe('2024-12-31T23:00:00.000Z')
  })

  it('0 mois en arrière : 1er du mois courant', () => {
    const start = monthsAgoParisMonthStartUtc(new Date('2026-08-30T12:00:00Z'), 0)
    expect(start.toISOString()).toBe('2026-07-31T22:00:00.000Z')
  })
})

describe('monthlySalesBuckets — seaux mensuels (mois civil Paris)', () => {
  it('13 seaux par défaut, du plus ancien au plus récent, mois courant inclus', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    const buckets = monthlySalesBuckets([], now)
    expect(buckets).toHaveLength(13)
    expect(buckets[0].month).toBe('2025-08')
    expect(buckets[0].label).toBe('août 2025')
    expect(buckets[12].month).toBe('2026-08')
    expect(buckets[12].label).toBe('août 2026')
  })

  it('mois manquants à 0, jamais un trou', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    const buckets = monthlySalesBuckets([], now)
    expect(buckets.every((b) => b.ca === 0 && b.nbCommandes === 0)).toBe(true)
  })

  it('bascule d’année : janvier courant remonte à janvier de l’année précédente', () => {
    const now = new Date('2026-01-15T12:00:00Z')
    const buckets = monthlySalesBuckets([], now)
    expect(buckets[0].month).toBe('2025-01')
    expect(buckets[0].label).toBe('janvier 2025')
    expect(buckets[12].month).toBe('2026-01')
    expect(buckets[12].label).toBe('janvier 2026')
  })

  it('agrège plusieurs commandes du même mois civil Paris', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    const rows = [
      historyRow({ createdAt: '2026-08-01T10:00:00Z', totalTTC: 10 }),
      historyRow({ createdAt: '2026-08-14T20:00:00Z', totalTTC: 5 }),
    ]
    const buckets = monthlySalesBuckets(rows, now)
    const august = buckets[buckets.length - 1]
    expect(august.month).toBe('2026-08')
    expect(august.ca).toBe(15)
    expect(august.nbCommandes).toBe(2)
  })

  it('changement d’heure mars : un ordre après 22h UTC le 31/03 tombe déjà en avril à Paris (CEST)', () => {
    const now = new Date('2026-11-15T12:00:00Z')
    const rows = [historyRow({ createdAt: '2026-03-31T22:30:00Z', totalTTC: 40 })]
    const buckets = monthlySalesBuckets(rows, now)
    const april = buckets.find((b) => b.month === '2026-04')!
    const march = buckets.find((b) => b.month === '2026-03')!
    expect(april.ca).toBe(40)
    expect(march.ca).toBe(0)
  })

  it('changement d’heure octobre : un ordre après 23h UTC le 31/10 tombe déjà en novembre à Paris (CET)', () => {
    const now = new Date('2026-11-15T12:00:00Z')
    const rows = [historyRow({ createdAt: '2026-10-31T23:30:00Z', totalTTC: 25 })]
    const buckets = monthlySalesBuckets(rows, now)
    const november = buckets.find((b) => b.month === '2026-11')!
    const october = buckets.find((b) => b.month === '2026-10')!
    expect(november.ca).toBe(25)
    expect(october.ca).toBe(0)
  })

  it('étanchéité comptable : un don n’alimente aucun seau', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    const rows = [historyRow({ createdAt: now.toISOString(), totalTTC: 500, orderType: 'don' })]
    const buckets = monthlySalesBuckets(rows, now)
    expect(buckets.reduce((sum, b) => sum + b.ca, 0)).toBe(0)
  })

  it('une commande hors fenêtre (plus de 13 mois) n’apparaît dans aucun seau, jamais un plantage', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    const rows = [historyRow({ createdAt: '2020-01-01T00:00:00Z', totalTTC: 999 })]
    const buckets = monthlySalesBuckets(rows, now)
    expect(buckets.reduce((sum, b) => sum + b.ca, 0)).toBe(0)
  })

  it('paidAt prime sur createdAt pour déterminer le mois', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    const rows = [historyRow({ paidAt: '2026-08-05T10:00:00Z', createdAt: '2026-06-01T10:00:00Z', totalTTC: 77 })]
    const buckets = monthlySalesBuckets(rows, now)
    expect(buckets.find((b) => b.month === '2026-08')!.ca).toBe(77)
    expect(buckets.find((b) => b.month === '2026-06')!.ca).toBe(0)
  })

  it('paramètre months personnalisable', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    const buckets = monthlySalesBuckets([], now, 3)
    expect(buckets.map((b) => b.month)).toEqual(['2026-06', '2026-07', '2026-08'])
  })
})

describe('monthlyBucketToChartInput — adaptateur pour salesChartGeometry', () => {
  it('mappe {month, ca} en {day, ca} sans dupliquer la géométrie', () => {
    const bucket = { month: '2026-08', label: 'août 2026', ca: 120, nbCommandes: 3 }
    expect(monthlyBucketToChartInput(bucket)).toEqual({ day: '2026-08', ca: 120 })
  })

  it('la géométrie fonctionne telle quelle sur des seaux mensuels adaptés', () => {
    const buckets = [
      { month: '2026-07', label: 'juillet 2026', ca: 10, nbCommandes: 1 },
      { month: '2026-08', label: 'août 2026', ca: 40, nbCommandes: 2 },
    ]
    const bars = salesChartGeometry(buckets.map(monthlyBucketToChartInput), { width: 200, height: 100 })
    expect(bars).toHaveLength(2)
    expect(bars[1].h).toBe(100)
    expect(bars[0].h).toBe(25)
  })
})

describe('topTitles — agrégation par titre sur une fenêtre glissante', () => {
  const now = new Date('2026-08-30T12:00:00Z')

  it('agrège exemplaires et CA par titleSnapshot, plusieurs commandes/lignes du même titre', () => {
    const rows = [
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 2, titleSnapshot: 'Livre A', unitPriceTTC: 10 }] }),
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 3, titleSnapshot: 'Livre A', unitPriceTTC: 10 }] }),
    ]
    const top = topTitles(rows, now, { days: 30, max: 10 })
    expect(top).toEqual([{ title: 'Livre A', exemplaires: 5, ca: 50 }])
  })

  it('tri exemplaires décroissant puis CA décroissant (départage)', () => {
    const rows = [
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 10, titleSnapshot: 'C', unitPriceTTC: 1 }] }),
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 5, titleSnapshot: 'B', unitPriceTTC: 16 }] }),
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 5, titleSnapshot: 'A', unitPriceTTC: 10 }] }),
    ]
    const top = topTitles(rows, now, { days: 30, max: 10 })
    expect(top.map((t) => t.title)).toEqual(['C', 'B', 'A'])
  })

  it('cap max', () => {
    const rows = [
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 3, titleSnapshot: 'A', unitPriceTTC: 1 }] }),
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 2, titleSnapshot: 'B', unitPriceTTC: 1 }] }),
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 1, titleSnapshot: 'C', unitPriceTTC: 1 }] }),
    ]
    expect(topTitles(rows, now, { days: 30, max: 2 }).map((t) => t.title)).toEqual(['A', 'B'])
  })

  it('étanchéité comptable : un don (contrepartie) est exclu, jamais un exemplaire/CA fictif', () => {
    const rows = [
      historyRow({
        createdAt: now.toISOString(),
        orderType: 'don',
        lines: [{ quantity: 1, titleSnapshot: 'Contrepartie', unitPriceTTC: 0 }],
      }),
    ]
    expect(topTitles(rows, now, { days: 30, max: 10 })).toEqual([])
  })

  it('une précommande compte normalement (seuls les dons sont exclus)', () => {
    const rows = [
      historyRow({
        createdAt: now.toISOString(),
        orderType: 'precommande',
        lines: [{ quantity: 2, titleSnapshot: 'À paraître', unitPriceTTC: 15 }],
      }),
    ]
    expect(topTitles(rows, now, { days: 30, max: 10 })).toEqual([{ title: 'À paraître', exemplaires: 2, ca: 30 }])
  })

  it('une ligne hors fenêtre glissante n’est pas comptée', () => {
    const rows = [
      historyRow({
        createdAt: new Date(now.getTime() - 40 * DAY_MS).toISOString(),
        lines: [{ quantity: 99, titleSnapshot: 'Hors fenêtre', unitPriceTTC: 10 }],
      }),
    ]
    expect(topTitles(rows, now, { days: 30, max: 10 })).toEqual([])
  })

  it('arrondi euros : pas de bruit flottant (3 × 9,99)', () => {
    const rows = [
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 1, titleSnapshot: 'A', unitPriceTTC: 9.99 }] }),
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 1, titleSnapshot: 'A', unitPriceTTC: 9.99 }] }),
      historyRow({ createdAt: now.toISOString(), lines: [{ quantity: 1, titleSnapshot: 'A', unitPriceTTC: 9.99 }] }),
    ]
    expect(topTitles(rows, now, { days: 30, max: 10 })[0].ca).toBe(29.97)
  })

  it('aucune ligne dans la fenêtre : liste vide', () => {
    expect(topTitles([], now, { days: 30, max: 10 })).toEqual([])
  })
})

/* ────────────────────────── Vélocité stock ────────────────────────── */

describe('quantitySoldByBook / precommandeQuantityByBook', () => {
  const now = new Date('2026-08-30T12:00:00Z')

  it('somme les quantités par livre, fenêtre courante seulement', () => {
    const rows: SalesWindowRow[] = [
      salesRow({ createdAt: now.toISOString(), lines: [{ quantity: 2, book: 1 }, { quantity: 1, book: 2 }] }),
      salesRow({ createdAt: now.toISOString(), lines: [{ quantity: 3, book: 1 }] }),
      salesRow({ createdAt: '2026-01-01T00:00:00Z', lines: [{ quantity: 100, book: 1 }] }),
    ]
    const byBook = quantitySoldByBook(rows, now)
    expect(byBook.get(1)).toBe(5)
    expect(byBook.get(2)).toBe(1)
  })

  it('quantitySoldByBook compte les dons (décrément physique du stock)', () => {
    const rows: SalesWindowRow[] = [
      salesRow({ createdAt: now.toISOString(), orderType: 'don', lines: [{ quantity: 1, book: 9 }] }),
    ]
    expect(quantitySoldByBook(rows, now).get(9)).toBe(1)
  })

  it('precommandeQuantityByBook ne retient que orderType precommande', () => {
    const rows: SalesWindowRow[] = [
      salesRow({ createdAt: now.toISOString(), orderType: 'commande', lines: [{ quantity: 4, book: 1 }] }),
      salesRow({ createdAt: now.toISOString(), orderType: 'precommande', lines: [{ quantity: 2, book: 1 }] }),
    ]
    const byBook = precommandeQuantityByBook(rows, now)
    expect(byBook.get(1)).toBe(2)
  })

  it('ligne sans livre (book: null) ignorée', () => {
    const rows: SalesWindowRow[] = [
      salesRow({ createdAt: now.toISOString(), lines: [{ quantity: 5, book: null }] }),
    ]
    expect(quantitySoldByBook(rows, now).size).toBe(0)
  })
})

describe('stockOutlook — projection de rupture', () => {
  const now = new Date('2026-08-30T00:00:00Z')

  function book(overrides: Partial<StockOutlookInput> = {}): StockOutlookInput {
    return { id: 1, title: 'Titre', edition: 'editions-sociales', stock: 30, stockSuivi: 'manuel', ...overrides }
  }

  it('stock null : jamais de vélocité calculable (joursRestants/rupturePrevue null)', () => {
    const [row] = stockOutlook([book({ stock: null })], new Map([[1, 10]]), now)
    expect(row.joursRestants).toBeNull()
    expect(row.rupturePrevue).toBeNull()
    expect(row.vendus30j).toBe(10)
  })

  it('vélocité nulle (0 vendu) : jamais une division par zéro déguisée en infini', () => {
    const [row] = stockOutlook([book({ stock: 10 })], new Map(), now)
    expect(row.vendus30j).toBe(0)
    expect(row.velociteJour).toBe(0)
    expect(row.joursRestants).toBeNull()
    expect(row.rupturePrevue).toBeNull()
  })

  it('joursRestants arrondi à l’entier inférieur', () => {
    // stock 10, vendus30j 20 → vélocité 20/30/j → 10 / (20/30) = 15 jours pile.
    const [row] = stockOutlook([book({ stock: 10 })], new Map([[1, 20]]), now)
    expect(row.velociteJour).toBeCloseTo(20 / 30)
    expect(row.joursRestants).toBe(15)
    expect(row.rupturePrevue).toBe('2026-09-14')
  })

  it('stock négatif (don avec contrepartie, décrément autorisé) : déjà en rupture', () => {
    const [row] = stockOutlook([book({ stock: -2 })], new Map([[1, 5]]), now)
    expect(row.joursRestants).toBeLessThan(0)
  })
})

describe('urgentStockRows — sélection + tri', () => {
  function row(overrides: Partial<StockOutlookRow> = {}): StockOutlookRow {
    return {
      id: 1,
      title: 'Titre',
      edition: null,
      stock: 5,
      stockSuivi: 'manuel',
      vendus30j: 1,
      velociteJour: 1 / 30,
      joursRestants: 10,
      rupturePrevue: '2026-09-10',
      ...overrides,
    }
  }

  it('épuisés (stock <= 0) toujours en tête, quel que soit joursRestants', () => {
    const rows = [
      row({ id: 1, stock: 0, joursRestants: 0 }),
      row({ id: 2, stock: 5, joursRestants: 1 }),
    ]
    expect(urgentStockRows(rows).map((r) => r.id)).toEqual([1, 2])
  })

  it('parmi les non-épuisés, rupture la plus proche d’abord', () => {
    const rows = [
      row({ id: 1, stock: 5, joursRestants: 20 }),
      row({ id: 2, stock: 5, joursRestants: 3 }),
      row({ id: 3, stock: 5, joursRestants: 10 }),
    ]
    expect(urgentStockRows(rows).map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('un titre au-delà du seuil (30 j par défaut) est écarté', () => {
    const rows = [row({ id: 1, stock: 5, joursRestants: 45 })]
    expect(urgentStockRows(rows)).toEqual([])
  })

  it('seuil personnalisable', () => {
    const rows = [row({ id: 1, stock: 5, joursRestants: 12 })]
    expect(urgentStockRows(rows, 10)).toEqual([])
    expect(urgentStockRows(rows, 15)).toHaveLength(1)
  })

  it('stock non suivi (null) et vélocité nulle : jamais classé "urgent" par défaut', () => {
    const rows = [row({ id: 1, stock: null, joursRestants: null })]
    expect(urgentStockRows(rows)).toEqual([])
  })
})

describe('bucketWeeklyQuantities — sparkline 8 semaines', () => {
  const now = new Date('2026-08-30T00:00:00Z')

  it('8 seaux par défaut, du plus ancien au plus récent', () => {
    expect(bucketWeeklyQuantities([], now)).toHaveLength(8)
  })

  it('une vente d’aujourd’hui tombe dans le dernier seau', () => {
    const rows: DatedQuantity[] = [{ date: now.toISOString(), quantity: 3 }]
    const buckets = bucketWeeklyQuantities(rows, now)
    expect(buckets[buckets.length - 1]).toBe(3)
    expect(buckets.slice(0, -1).every((v) => v === 0)).toBe(true)
  })

  it('une vente vieille de 7 jours tombe dans l’avant-dernier seau', () => {
    const rows: DatedQuantity[] = [{ date: new Date(now.getTime() - 7 * DAY_MS).toISOString(), quantity: 2 }]
    const buckets = bucketWeeklyQuantities(rows, now)
    expect(buckets[buckets.length - 2]).toBe(2)
  })

  it('au-delà de `weeks` semaines : ignorée', () => {
    const rows: DatedQuantity[] = [{ date: new Date(now.getTime() - 100 * DAY_MS).toISOString(), quantity: 9 }]
    expect(bucketWeeklyQuantities(rows, now, 8).every((v) => v === 0)).toBe(true)
  })

  it('date future ou illisible : ignorée, jamais un plantage', () => {
    const rows: DatedQuantity[] = [
      { date: new Date(now.getTime() + DAY_MS).toISOString(), quantity: 5 },
      { date: 'n/a', quantity: 5 },
    ]
    expect(bucketWeeklyQuantities(rows, now).every((v) => v === 0)).toBe(true)
  })
})

/* ────────────────────────── Résumés (file de travail / bloc « En cours ») ────────────────────────── */

describe('humanAge', () => {
  const now = new Date('2026-07-13T12:00:00Z')
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()

  it('moins de 60 s : « à l’instant »', () => {
    expect(humanAge(ago(59), now)).toBe('à l’instant')
  })

  it('exactement 60 s : 1 min', () => {
    expect(humanAge(ago(60), now)).toBe('il y a 1 min')
  })

  it('59 min 59 s : encore en minutes', () => {
    expect(humanAge(ago(59 * 60 + 59), now)).toBe('il y a 59 min')
  })

  it('exactement 60 min : 1 h', () => {
    expect(humanAge(ago(60 * 60), now)).toBe('il y a 1 h')
  })

  it('23 h 59 : encore en heures', () => {
    expect(humanAge(ago(23 * 3600 + 3599), now)).toBe('il y a 23 h')
  })

  it('exactement 24 h : 1 j', () => {
    expect(humanAge(ago(24 * 3600), now)).toBe('il y a 1 j')
  })

  it('date illisible : tiret, jamais un plantage', () => {
    expect(humanAge('n/a', now)).toBe('—')
  })
})

describe('summarizeLines', () => {
  const line = (titleSnapshot: string, quantity: number): SummarizableLine => ({ titleSnapshot, quantity })

  it('aucune ligne : chaîne vide', () => {
    expect(summarizeLines([])).toBe('')
  })

  it('moins que le maximum : toutes les lignes, pas de "+ N autres"', () => {
    expect(summarizeLines([line('Titre A', 2)])).toBe('2× Titre A')
  })

  it('au-delà du maximum : "+ N autres" compte les LIGNES, pas les exemplaires', () => {
    const lines = [line('Titre A', 2), line('Titre B', 1), line('Titre C', 50), line('Titre D', 1)]
    expect(summarizeLines(lines, 2)).toBe('2× Titre A + 1× Titre B + 2 autres')
  })

  it('exactement une ligne au-delà : singulier "autre"', () => {
    const lines = [line('Titre A', 1), line('Titre B', 1)]
    expect(summarizeLines(lines, 1)).toBe('1× Titre A + 1 autre')
  })

  it('max par défaut à 3', () => {
    const lines = [line('A', 1), line('B', 1), line('C', 1)]
    expect(summarizeLines(lines)).toBe('1× A + 1× B + 1× C')
  })
})

/* ────────────────────────── Raccourci « Ventes du mois » (zone C) ────────────────────────── */

describe('parisMonthBounds — bornes UTC du mois civil de Paris', () => {
  it('janvier (UTC+1) : du 31/12 23:00 UTC au 31/01 23:00 UTC', () => {
    const { start, end, label } = parisMonthBounds(new Date('2026-01-15T12:00:00Z'))
    expect(start.toISOString()).toBe('2025-12-31T23:00:00.000Z')
    expect(end.toISOString()).toBe('2026-01-31T23:00:00.000Z')
    expect(label).toBe('janvier 2026')
  })

  it('juillet (UTC+2) : du 30/06 22:00 UTC au 31/07 22:00 UTC', () => {
    const { start, end, label } = parisMonthBounds(new Date('2026-07-13T05:00:00Z'))
    expect(start.toISOString()).toBe('2026-06-30T22:00:00.000Z')
    expect(end.toISOString()).toBe('2026-07-31T22:00:00.000Z')
    expect(label).toBe('juillet 2026')
  })

  it('décembre : la borne haute bascule sur janvier de l’année suivante (UTC+1 des deux côtés)', () => {
    const { start, end, label } = parisMonthBounds(new Date('2026-12-05T00:00:00Z'))
    expect(start.toISOString()).toBe('2026-11-30T23:00:00.000Z')
    expect(end.toISOString()).toBe('2026-12-31T23:00:00.000Z')
    expect(label).toBe('décembre 2026')
  })

  it('un 31/03 22:30 UTC est déjà le 1ᵉʳ avril à Paris (CEST) : le mois retenu est avril', () => {
    const { start, end } = parisMonthBounds(new Date('2026-03-31T22:30:00Z'))
    expect(start.toISOString()).toBe('2026-03-31T22:00:00.000Z')
    expect(end.toISOString()).toBe('2026-04-30T22:00:00.000Z')
  })

  it('un 31/10 23:30 UTC est déjà le 1ᵉʳ novembre à Paris (CET) : le mois retenu est novembre', () => {
    const { start } = parisMonthBounds(new Date('2026-10-31T23:30:00Z'))
    expect(start.toISOString()).toBe('2026-10-31T23:00:00.000Z')
  })
})


/* ────────────────────────── Import routeur (3.7) ────────────────────────── */

describe('importSignal — seuil provisoire 35 jours', () => {
  const now = new Date('2026-07-13T12:00:00Z')
  const ranAgo = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString()

  it('aucun import enregistré : gris, jamais un rouge alarmiste', () => {
    expect(importSignal(null, now)).toBe('na')
  })

  it('horodatage illisible : gris', () => {
    expect(importSignal('n/a', now)).toBe('na')
  })

  it('exactement 35 jours : encore OK (seuil strict)', () => {
    expect(importSignal(ranAgo(IMPORT_ALERT_DAYS), now)).toBe('ok')
  })

  it('au-delà de 35 jours : alerte', () => {
    expect(importSignal(ranAgo(IMPORT_ALERT_DAYS + 0.01), now)).toBe('alert')
  })

  it('import récent : OK', () => {
    expect(importSignal(ranAgo(10), now)).toBe('ok')
  })
})

/* ────────────────────────── Codes promo (3.11) ────────────────────────── */

describe('splitPromos — répartition live / expirées-encore-actives (jour-limite)', () => {
  const now = new Date('2026-07-13T10:00:00Z')

  it('expiré la veille et encore actif : expiredActive', () => {
    const promos = [{ id: 1, active: true, expiresAt: '2026-07-12' }]
    expect(splitPromos(promos, now)).toEqual({ live: [], expiredActive: promos })
  })

  it('le jour même de l’expiration : encore live (comparaison en jour, inclusive)', () => {
    const promos = [{ id: 1, active: true, expiresAt: '2026-07-13' }]
    expect(splitPromos(promos, now)).toEqual({ live: promos, expiredActive: [] })
    expect(
      splitPromos([{ id: 2, active: true, expiresAt: '2026-07-13T23:59:00.000Z' }], now).expiredActive,
    ).toEqual([])
  })

  it('sans date d’expiration : toujours live', () => {
    const promos = [{ id: 1, active: true, expiresAt: null }]
    expect(splitPromos(promos, now)).toEqual({ live: promos, expiredActive: [] })
  })

  it('inactif : absent des deux lots', () => {
    const promos = [
      { id: 1, active: false, expiresAt: '2026-01-01' },
      { id: 2, active: null, expiresAt: '2026-01-01' },
    ]
    expect(splitPromos(promos, now)).toEqual({ live: [], expiredActive: [] })
  })

  it('un horodatage complet de la veille expire bien', () => {
    const promos = [{ id: 1, active: true, expiresAt: '2026-07-12T23:59:00.000Z' }]
    expect(splitPromos(promos, now)).toEqual({ live: [], expiredActive: promos })
  })
})

/* ────────────────────────── Observabilité (3.12) ────────────────────────── */

describe('sentryErrorEvents — `count` arrive en chaîne dans l’API Sentry', () => {
  it('additionne error + fatal, chaîne ou nombre, ignore les autres niveaux', () => {
    expect(
      sentryErrorEvents([
        { level: 'error', count: '12' },
        { level: 'fatal', count: 3 },
        { level: 'warning', count: '99' },
        { level: 'error' },
        { level: 'error', count: 'n/a' },
      ]),
    ).toBe(15)
  })

  it('aucune issue : zéro', () => {
    expect(sentryErrorEvents([])).toBe(0)
  })
})

describe('sentrySignal', () => {
  it('non calculable (token absent, API en échec) : gris, jamais vert par défaut', () => {
    expect(sentrySignal(null)).toBe('na')
  })

  it('0 événement d’erreur en 24 h : OK', () => {
    expect(sentrySignal(0)).toBe('ok')
  })

  it('au moins un événement error/fatal : alerte', () => {
    expect(sentrySignal(1)).toBe('alert')
  })
})

/* ────────────────────────── Bandeau (3.1) ────────────────────────── */

function item(state: BannerItem['state'], key: BannerItem['key'] = 'commandes'): BannerItem {
  return { key, label: 'Commandes', state, anchor: null }
}

describe('bannerHidden — masqué si et seulement si tout est vert', () => {
  it('toutes les pastilles vertes : masqué', () => {
    expect(bannerHidden([item('ok'), item('ok'), item('ok')])).toBe(true)
  })

  it('un gris (signal non calculable) maintient le bandeau visible', () => {
    expect(bannerHidden([item('ok'), item('na')])).toBe(false)
  })

  it('une attention ou une alerte le maintient visible', () => {
    expect(bannerHidden([item('ok'), item('warn')])).toBe(false)
    expect(bannerHidden([item('ok'), item('alert')])).toBe(false)
  })
})

describe('pastilleText', () => {
  it('vocabulaire éditeur par état', () => {
    expect(pastilleText({ key: 'stock', label: 'Stock', state: 'ok', anchor: null })).toBe(
      'Stock : OK',
    )
    expect(pastilleText({ key: 'commandes', label: 'Commandes', state: 'warn', anchor: null })).toBe(
      'Commandes : à vérifier',
    )
    expect(pastilleText({ key: 'stock', label: 'Stock', state: 'alert', anchor: null })).toBe(
      'Stock : en alerte',
    )
    expect(pastilleText({ key: 'stock', label: 'Stock', state: 'na', anchor: null })).toBe(
      'Stock : indisponible',
    )
  })

  it('cas particulier import : gris = « aucun import enregistré », pas « indisponible »', () => {
    expect(
      pastilleText({ key: 'import', label: 'Import routeur', state: 'na', anchor: null }),
    ).toBe('Import routeur : aucun import enregistré')
  })
})

/* ────────────────────────── Formatage ────────────────────────── */

describe('formatage français', () => {
  it('fmtEuros', () => {
    expect(plain(fmtEuros(1234.5))).toBe('1 234,50 €')
    expect(plain(fmtEuros(0))).toBe('0,00 €')
  })

  it('fmtEurosAxis — sans centimes, arrondi (graduations d’axe)', () => {
    expect(plain(fmtEurosAxis(150))).toBe('150 €')
    expect(plain(fmtEurosAxis(0))).toBe('0 €')
    expect(plain(fmtEurosAxis(4210))).toBe('4 210 €')
  })

  it('fmtDateTimeFr — heure de Paris', () => {
    expect(plain(fmtDateTimeFr('2026-07-09T12:02:00Z'))).toBe('9 juillet à 14:02')
    expect(fmtDateTimeFr('pas une date')).toBe('—')
  })

  it('fmtDateFr — heure de Paris', () => {
    expect(fmtDateFr('2026-07-03T02:12:00Z')).toBe('3 juillet 2026')
    expect(fmtDateFr('')).toBe('—')
  })

  it('fmtDayMonthFr — jour + mois sans année, heure de Paris', () => {
    expect(fmtDayMonthFr('2026-08-12T10:00:00Z')).toBe('12 août')
    expect(fmtDayMonthFr('pas une date')).toBe('—')
  })

  it('editionTag', () => {
    expect(editionTag('editions-sociales')).toBe('ES')
    expect(editionTag('la-dispute')).toBe('LD')
    expect(editionTag(null)).toBe('BOUT.')
    expect(editionTag(undefined)).toBe('BOUT.')
  })
})
