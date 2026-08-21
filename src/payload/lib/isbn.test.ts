import { describe, expect, it } from 'vitest'

import { compactIsbn, isbn13FromIsbn, trimIsbn, validateIsbnValue } from './isbn.ts'

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

describe('isbn13FromIsbn', () => {
  it('renvoie un ISBN-13 tel quel (compacté)', () => {
    expect(isbn13FromIsbn('9782843033452')).toBe('9782843033452')
  })

  it('accepte un ISBN-13 avec tirets/espaces', () => {
    expect(isbn13FromIsbn('978-2-35367-036-9')).toBe('9782353670369')
    expect(isbn13FromIsbn('978 2 35367 036 9')).toBe('9782353670369')
  })

  it('convertit un ISBN-10 valide en ISBN-13 (préfixe 978, clé recalculée)', () => {
    expect(isbn13FromIsbn('0-306-40615-2')).toBe('9780306406157')
  })

  it('convertit un ISBN-10 se terminant par X', () => {
    expect(isbn13FromIsbn('0-9752298-0-X')).toBe('9780975229804')
  })

  it('renvoie null pour un ISBN invalide (clé de contrôle fausse)', () => {
    expect(isbn13FromIsbn('978-2-35367-036-0')).toBeNull()
  })

  it('renvoie null pour une chaîne vide', () => {
    expect(isbn13FromIsbn('')).toBeNull()
    expect(isbn13FromIsbn('   ')).toBeNull()
  })
})
