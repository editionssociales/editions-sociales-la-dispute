import { describe, expect, it } from 'vitest'

import { slugify } from './slugify.ts'

describe('slugify', () => {
  it('minuscules, accents, espaces', () => {
    expect(slugify('Le Capital')).toBe('le-capital')
    expect(slugify("L'Idéologie allemande")).toBe('l-ideologie-allemande')
  })

  it('retire la ponctuation et les tirets de bord', () => {
    expect(slugify('  Vive la Commune !  ')).toBe('vive-la-commune')
    expect(slugify('Manuscrits de 1844')).toBe('manuscrits-de-1844')
  })

  it('chaîne vide', () => {
    expect(slugify('')).toBe('')
    expect(slugify('   ')).toBe('')
  })
})
