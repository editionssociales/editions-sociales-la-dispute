import { describe, expect, it } from 'vitest'

import { formatOrderNumber } from './order-number.ts'

describe('formatOrderNumber', () => {
  it('préfixe et complète à 6 chiffres', () => {
    expect(formatOrderNumber(1)).toBe('CMD-000001')
    expect(formatOrderNumber(42)).toBe('CMD-000042')
    expect(formatOrderNumber(123456)).toBe('CMD-123456')
  })

  it("ne tronque pas au-delà de 6 chiffres", () => {
    expect(formatOrderNumber(1234567)).toBe('CMD-1234567')
  })
})
