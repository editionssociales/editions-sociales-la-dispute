import { describe, expect, it } from 'vitest'

import { compactIsbn, trimIsbn, validateIsbnValue } from './isbn.ts'

describe('trimIsbn', () => {
  it('retire les espaces de bord', () => {
    expect(trimIsbn('  978-2-35367-036-9  ')).toBe('978-2-35367-036-9')
  })
})

describe('compactIsbn', () => {
  it('retire tirets et espaces', () => {
    expect(compactIsbn('978-2-35367-036-9')).toBe('9782353670369')
    expect(compactIsbn('978 2 35367 036 9')).toBe('9782353670369')
  })
})

describe('validateIsbnValue', () => {
  it('accepte vide / null', () => {
    expect(validateIsbnValue(null)).toBe(true)
    expect(validateIsbnValue('')).toBe(true)
    expect(validateIsbnValue('   ')).toBe(true)
  })

  it('accepte un ISBN-13 avec tirets (clé de contrôle ok)', () => {
    expect(validateIsbnValue('978-2-35367-036-9')).toBe(true)
    expect(validateIsbnValue('9782843033452')).toBe(true)
  })

  it('accepte un ISBN-10', () => {
    expect(validateIsbnValue('0-306-40615-2')).toBe(true)
  })

  it('refuse une clé de contrôle fausse', () => {
    expect(validateIsbnValue('978-2-35367-036-0')).toBe(
      'ISBN invalide — attendu ISBN-13 (ex. 978-2-35367-036-9) ou ISBN-10.',
    )
  })

  it('refuse les caractères hors format', () => {
    expect(validateIsbnValue('ISBN 978-2-35367-036-9')).toBe(
      'ISBN : uniquement chiffres, espaces ou tirets (ex. 978-2-35367-036-9).',
    )
  })

  it('refuse une longueur incorrecte', () => {
    expect(validateIsbnValue('978-2')).toMatch(/^ISBN invalide/)
  })
})
