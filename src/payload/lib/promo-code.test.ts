import { describe, expect, it } from 'vitest'

import { normalizePromoCode } from './promo-code.ts'

describe('normalizePromoCode', () => {
  it('met en majuscules', () => {
    expect(normalizePromoCode('agreg2027')).toBe('AGREG2027')
  })

  it('retire les espaces de bord', () => {
    expect(normalizePromoCode('  Agreg2027 ')).toBe('AGREG2027')
  })

  it('est idempotente', () => {
    expect(normalizePromoCode(normalizePromoCode('agreg2027'))).toBe('AGREG2027')
  })
})
