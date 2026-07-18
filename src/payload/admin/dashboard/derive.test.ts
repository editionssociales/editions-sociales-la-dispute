import { describe, expect, it } from 'vitest'

import {
  bannerHidden,
  CAMPAIGN_LAUNCH_2026,
  commandesState,
  donationsSignal,
  donsState,
  editionTag,
  expiredActivePromos,
  fmtDateFr,
  fmtDateTimeFr,
  fmtEuros,
  IMPORT_ALERT_DAYS,
  importSignal,
  ORDER_ALERT_HOURS,
  ORDER_WARN_HOURS,
  orderLateness,
  parisMonthBounds,
  pastilleText,
  sentryErrorEvents,
  sentrySignal,
  STOCK_SEUIL_FALLBACK,
  stockRowState,
  stockSignal,
  sumSalesTTC,
  worstState,
  type BannerItem,
  type DonationSignalInput,
} from './derive.ts'
import type { DonationsData, WorkOrderRow, WorkOrdersData } from './data.ts'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** Espaces insécables (fine ou pleine) → espace simple : les assertions ne dépendent pas de la version d'ICU. */
function plain(s: string): string {
  return s.replace(/[  ]/g, ' ')
}

/* ────────────────────────── orderLateness (3.2) ────────────────────────── */

describe('orderLateness — bornes 48 h / 72 h (seuils provisoires)', () => {
  const now = new Date('2026-07-13T12:00:00Z')
  const paidAgo = (hours: number) => ({
    status: 'paid',
    paidAt: new Date(now.getTime() - hours * HOUR_MS).toISOString(),
    createdAt: '2026-01-01T00:00:00Z',
  })

  it('exactement 48 h : encore OK (le seuil est strict)', () => {
    expect(orderLateness(paidAgo(ORDER_WARN_HOURS), now)).toBe('ok')
  })

  it('juste au-delà de 48 h : attention', () => {
    expect(orderLateness(paidAgo(ORDER_WARN_HOURS + 0.01), now)).toBe('warn')
  })

  it('exactement 72 h : encore attention', () => {
    expect(orderLateness(paidAgo(ORDER_ALERT_HOURS), now)).toBe('warn')
  })

  it('juste au-delà de 72 h : alerte', () => {
    expect(orderLateness(paidAgo(ORDER_ALERT_HOURS + 0.01), now)).toBe('alert')
  })

  it('une commande `prepared` ne vieillit pas (prise en charge)', () => {
    expect(
      orderLateness(
        { status: 'prepared', paidAt: '2026-07-01T00:00:00Z', createdAt: '2026-07-01T00:00:00Z' },
        now,
      ),
    ).toBe('ok')
  })

  it('sans paidAt, l’âge se mesure depuis createdAt', () => {
    expect(
      orderLateness(
        {
          status: 'paid',
          paidAt: null,
          createdAt: new Date(now.getTime() - 80 * HOUR_MS).toISOString(),
        },
        now,
      ),
    ).toBe('alert')
  })

  it('date illisible : jamais une fausse alerte', () => {
    expect(orderLateness({ status: 'paid', paidAt: 'n/a', createdAt: 'n/a' }, now)).toBe('ok')
  })
})

/* ────────────────────────── worstState / stock (3.3) ────────────────────────── */

describe('worstState', () => {
  it('alerte > attention > gris > OK', () => {
    expect(worstState(['ok', 'na', 'warn', 'alert'])).toBe('alert')
    expect(worstState(['ok', 'na', 'warn'])).toBe('warn')
    expect(worstState(['ok', 'na'])).toBe('na')
    expect(worstState(['ok', 'ok'])).toBe('ok')
    expect(worstState([])).toBe('ok')
  })
})

/* ────────────────────────── commandesState (bandeau 3.1 / dot 3.2) ────────────────────────── */

function workOrder(overrides: Partial<WorkOrderRow> = {}): WorkOrderRow {
  return {
    id: 1,
    number: 'CMD-1',
    status: 'paid',
    createdAt: '2026-07-01T00:00:00Z',
    paidAt: '2026-07-01T00:00:00Z',
    linesCount: 1,
    totalTTC: 20,
    shippingMethod: 'standard',
    ...overrides,
  }
}

describe('commandesState — jamais de vert/rouge par défaut, seam data/derive/rendu', () => {
  const now = new Date('2026-07-13T12:00:00Z')
  const okWorkOrders: WorkOrdersData = { state: 'ok', orders: [] }
  const alertOrder = workOrder({
    paidAt: new Date(now.getTime() - (ORDER_ALERT_HOURS + 1) * HOUR_MS).toISOString(),
  })
  const warnOrder = workOrder({
    paidAt: new Date(now.getTime() - (ORDER_WARN_HOURS + 1) * HOUR_MS).toISOString(),
  })

  it('liste de travail non lue (`null`) : gris', () => {
    expect(commandesState(null, now)).toBe('na')
  })

  it('liste de travail illisible : gris', () => {
    expect(commandesState({ state: 'na' }, now)).toBe('na')
  })

  it('aucune commande en attente : OK', () => {
    expect(commandesState(okWorkOrders, now)).toBe('ok')
  })

  it('une commande en attention : attention', () => {
    expect(commandesState({ state: 'ok', orders: [warnOrder] }, now)).toBe('warn')
  })

  it('une commande en alerte : alerte (pire état l’emporte)', () => {
    expect(commandesState({ state: 'ok', orders: [warnOrder, alertOrder] }, now)).toBe('alert')
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

/* ────────────────────────── Ventes du mois (3.5) ────────────────────────── */

describe('sumSalesTTC', () => {
  it('somme les totaux et ignore les montants non finis', () => {
    expect(sumSalesTTC([{ totalTTC: 19 }, { totalTTC: 35.5 }, { totalTTC: Number.NaN }])).toBe(54.5)
    expect(sumSalesTTC([])).toBe(0)
  })
})

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

describe('expiredActivePromos — jour-limite', () => {
  const now = new Date('2026-07-13T10:00:00Z')

  it('expiré la veille et encore actif : candidat à la désactivation', () => {
    const promos = [{ id: 1, active: true, expiresAt: '2026-07-12' }]
    expect(expiredActivePromos(promos, now)).toEqual(promos)
  })

  it('le jour même de l’expiration : pas encore expiré (comparaison en jour)', () => {
    expect(expiredActivePromos([{ active: true, expiresAt: '2026-07-13' }], now)).toEqual([])
    expect(
      expiredActivePromos([{ active: true, expiresAt: '2026-07-13T23:59:00.000Z' }], now),
    ).toEqual([])
  })

  it('un horodatage complet de la veille expire bien', () => {
    const promos = [{ active: true, expiresAt: '2026-07-12T23:59:00.000Z' }]
    expect(expiredActivePromos(promos, now)).toEqual(promos)
  })

  it('inactif ou sans date d’expiration : jamais listé', () => {
    expect(
      expiredActivePromos(
        [
          { active: false, expiresAt: '2026-01-01' },
          { active: true, expiresAt: null },
          { active: null, expiresAt: '2026-01-01' },
        ],
        now,
      ),
    ).toEqual([])
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

/* ────────────────────────── Dons (3.6) ────────────────────────── */

function donationInput(overrides: Partial<DonationSignalInput>): DonationSignalInput {
  return {
    enabled: true,
    mode: 'live',
    gaugeAvailable: true,
    lastDonationAt: null,
    refunds7d: 0,
    now: new Date('2026-07-13T12:00:00Z'),
    ...overrides,
  }
}

describe('donationsSignal', () => {
  it('clé Stripe absente : alerte (« configuration des dons manquante »), jamais un 0 € trompeur', () => {
    expect(donationsSignal(donationInput({ enabled: false, mode: 'absent' }))).toBe('alert')
    expect(donationsSignal(donationInput({ enabled: false }))).toBe('alert')
  })

  it('mode test à moins de 7 jours du 15/08 : alerte', () => {
    expect(
      donationsSignal(donationInput({ mode: 'test', now: new Date('2026-08-10T12:00:00Z') })),
    ).toBe('alert')
  })

  it('mode test à plus de 7 jours de l’ouverture : pas d’alerte', () => {
    expect(
      donationsSignal(donationInput({ mode: 'test', now: new Date('2026-08-01T12:00:00Z') })),
    ).toBe('ok')
  })

  it('borne des 7 jours : à exactement 7 jours de l’ouverture, pas encore d’alerte (strict)', () => {
    // Lancement 2026-08-15T00:00:00+02:00 — 7 jours avant : 2026-08-08T00:00:00+02:00.
    expect(
      donationsSignal(donationInput({ mode: 'test', now: new Date('2026-08-07T22:00:00Z') })),
    ).toBe('ok')
    expect(
      donationsSignal(donationInput({ mode: 'test', now: new Date('2026-08-07T22:00:01Z') })),
    ).toBe('alert')
  })

  it('remboursement récent : alerte', () => {
    expect(donationsSignal(donationInput({ refunds7d: 1 }))).toBe('alert')
  })

  it('jauge non calculable : gris (l’alerte clé/remboursement prime, sinon jamais vert)', () => {
    expect(donationsSignal(donationInput({ gaugeAvailable: false }))).toBe('na')
    expect(donationsSignal(donationInput({ gaugeAvailable: false, refunds7d: 2 }))).toBe('alert')
  })

  it('campagne ouverte, aucun don depuis plus de 48 h : attention', () => {
    const now = new Date('2026-08-20T12:00:00Z')
    expect(donationsSignal(donationInput({ now, lastDonationAt: null }))).toBe('warn')
    expect(
      donationsSignal(donationInput({ now, lastDonationAt: '2026-08-17T12:00:00Z' })),
    ).toBe('warn')
    expect(donationsSignal(donationInput({ now, lastDonationAt: 'invalide' }))).toBe('warn')
  })

  it('campagne ouverte, don dans les 48 h : OK', () => {
    const now = new Date('2026-08-20T12:00:00Z')
    expect(
      donationsSignal(donationInput({ now, lastDonationAt: '2026-08-19T12:00:00Z' })),
    ).toBe('ok')
  })

  it('avant l’ouverture (15/08), l’absence de don n’est pas un signal', () => {
    expect(donationsSignal(donationInput({ lastDonationAt: null }))).toBe('ok')
    expect(Date.parse(`${CAMPAIGN_LAUNCH_2026}T00:00:00+02:00`)).toBeGreaterThan(
      donationInput({}).now.getTime(),
    )
  })
})

const FAKE_GAUGE: DonationsData['gauge'] = {
  collected: 100,
  goal: 1000,
  contributors: 5,
  percentOfGoal: 10,
  gauge: { value: 100, max: 1000, markers: [] },
}

function donationsData(overrides: Partial<DonationsData> = {}): DonationsData {
  return {
    mode: 'live',
    gauge: FAKE_GAUGE,
    recent: [],
    refunds7d: 0,
    lastDonationAt: null,
    ...overrides,
  }
}

describe('donsState — base donationsSignal, rétrogradée en gris si les listes dérivées sont illisibles', () => {
  const now = new Date('2026-07-13T12:00:00Z') // avant l'ouverture de la campagne (15/08).

  it('clé Stripe absente : alerte de base, jamais rétrogradée par les listes (mode absent exclut la rétrogradation)', () => {
    expect(
      donsState(donationsData({ mode: 'absent', gauge: null, recent: null, refunds7d: null }), now),
    ).toBe('alert')
  })

  it('base OK, derniers dons illisibles (`recent: null`) : rétrogradé en gris — jamais un OK par défaut', () => {
    expect(donsState(donationsData({ recent: null }), now)).toBe('na')
  })

  it('base OK, remboursements 7 j illisibles (`refunds7d: null`) : rétrogradé en gris', () => {
    expect(donsState(donationsData({ refunds7d: null }), now)).toBe('na')
  })

  it('base OK, les deux listes lisibles : reste OK', () => {
    expect(donsState(donationsData(), now)).toBe('ok')
  })

  it('jauge non calculable (base déjà grise) : reste grise', () => {
    expect(donsState(donationsData({ gauge: null }), now)).toBe('na')
  })

  it('base attention (campagne ouverte, aucun don depuis 48 h) + listes illisibles : reste attention, jamais une fausse alerte grise', () => {
    const campaignNow = new Date('2026-08-20T12:00:00Z')
    expect(
      donsState(
        donationsData({ recent: null, refunds7d: null, lastDonationAt: null }),
        campaignNow,
      ),
    ).toBe('warn')
  })

  it('base alerte (remboursement récent) + derniers dons illisibles : reste alerte, l’alerte réelle prime sur la rétrogradation', () => {
    expect(donsState(donationsData({ refunds7d: 1, recent: null }), now)).toBe('alert')
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

  it('un gris (diagnostic indisponible) maintient le bandeau visible', () => {
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
    expect(
      pastilleText({ key: 'diagnostic', label: 'Diagnostic technique', state: 'na', anchor: null }),
    ).toBe('Diagnostic technique : indisponible')
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
