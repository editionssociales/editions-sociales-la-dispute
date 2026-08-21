import { describe, expect, it } from 'vitest'

import {
  bannerHidden,
  bucketWeeklyQuantities,
  dailySalesBuckets,
  defaultExportDateRange,
  editionTag,
  fmtDateFr,
  fmtDateTimeFr,
  fmtEuros,
  humanAge,
  IMPORT_ALERT_DAYS,
  importSignal,
  parisDateYmd,
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
  urgentStockRows,
  worstState,
  type BannerItem,
  type DailySalesBucket,
  type DatedQuantity,
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

describe('defaultExportDateRange — aujourd’hui Paris → un mois en arrière', () => {
  it('plage simple (milieu de mois)', () => {
    expect(defaultExportDateRange(new Date('2026-07-20T12:00:00Z'))).toEqual({
      from: '2026-06-20',
      to: '2026-07-20',
    })
  })

  it('cale le jour si le mois cible est plus court (31 → 28/29)', () => {
    expect(defaultExportDateRange(new Date('2026-03-31T12:00:00Z'))).toEqual({
      from: '2026-02-28',
      to: '2026-03-31',
    })
  })

  it('parisDateYmd suit le fuseau Paris (soir UTC peut basculer de jour)', () => {
    // 2026-07-19 22:30 UTC = 2026-07-20 00:30 à Paris (CEST)
    expect(parisDateYmd(new Date('2026-07-19T22:30:00Z'))).toBe('2026-07-20')
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

  it('fmtDateTimeFr — heure de Paris', () => {
    expect(plain(fmtDateTimeFr('2026-07-09T12:02:00Z'))).toBe('9 juillet à 14:02')
    expect(fmtDateTimeFr('pas une date')).toBe('—')
  })

  it('fmtDateFr — heure de Paris', () => {
    expect(fmtDateFr('2026-07-03T02:12:00Z')).toBe('3 juillet 2026')
    expect(fmtDateFr('')).toBe('—')
  })

  it('editionTag', () => {
    expect(editionTag('editions-sociales')).toBe('ES')
    expect(editionTag('la-dispute')).toBe('LD')
    expect(editionTag(null)).toBe('BOUT.')
    expect(editionTag(undefined)).toBe('BOUT.')
  })
})
