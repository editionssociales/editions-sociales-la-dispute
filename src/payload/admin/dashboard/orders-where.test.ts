import { describe, expect, it } from 'vitest'

import { nonWooPendingOrdersWhere, soldOrdersWhere } from './orders-where.ts'

/* ────────────────────────── soldOrdersWhere ────────────────────────── */

describe('soldOrdersWhere', () => {
  it('sans borne : juste le filtre de statuts vendus (readPreorderTotals)', () => {
    expect(soldOrdersWhere()).toEqual({ status: { in: ['paid', 'prepared', 'shipped'] } })
  })

  it('avec borne : arbre and/or paidAt-sinon-createdAt, puis le filtre de statuts', () => {
    const iso = '2026-06-01T00:00:00.000Z'
    expect(soldOrdersWhere(iso)).toEqual({
      and: [
        {
          or: [
            { paidAt: { greater_than_equal: iso } },
            {
              and: [{ paidAt: { exists: false } }, { createdAt: { greater_than_equal: iso } }],
            },
          ],
        },
        { status: { in: ['paid', 'prepared', 'shipped'] } },
      ],
    })
  })

  it('jamais refunded/cancelled/failed dans les statuts vendus', () => {
    const where = soldOrdersWhere() as { status: { in: string[] } }
    expect(where.status.in).not.toContain('refunded')
    expect(where.status.in).not.toContain('cancelled')
    expect(where.status.in).not.toContain('failed')
  })
})

/* ────────────────────────── nonWooPendingOrdersWhere ────────────────────────── */

describe('nonWooPendingOrdersWhere', () => {
  it('statuts à traiter (paid/prepared, jamais shipped) + exclusion Woo par le numéro', () => {
    expect(nonWooPendingOrdersWhere()).toEqual([
      { status: { in: ['paid', 'prepared'] } },
      { number: { contains: 'CMD' } },
    ])
  })

  it('ne contient jamais shipped (déjà expédiée, hors file de travail)', () => {
    const [statusFilter] = nonWooPendingOrdersWhere() as [{ status: { in: string[] } }, unknown]
    expect(statusFilter.status.in).not.toContain('shipped')
  })
})
