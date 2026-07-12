import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import { matchStock, normalizeIsbn, parseRouterWorkbook, type BookRef } from './stock-import-core.ts'

/**
 * Fabrique un classeur .xls (BIFF, feuille "Feuille1") en mémoire — même
 * format que l'export routeur réel (`edso_stk_*.xls`), jamais le vrai fichier
 * client (cf. mission point 7 : fixture synthétique, en buffer).
 */
function routerWorkbook(rows: (string | number)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([['EAN', 'TIT', 'AUT', 'ABR', 'PUB', 'FIN'], ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Feuille1')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xls' }) as Buffer
}

function book(overrides: Partial<BookRef> & { id: number; slug: string; isbn: string | null }): BookRef {
  return { title: overrides.slug, stockSuivi: 'manuel', ...overrides }
}

describe('normalizeIsbn', () => {
  it('retire tirets et espaces', () => {
    expect(normalizeIsbn('978-2-35367-036-9')).toBe('9782353670369')
    expect(normalizeIsbn('978 2 35367 036 9')).toBe('9782353670369')
  })

  it('accepte un nombre (EAN lu en raw depuis le classeur)', () => {
    expect(normalizeIsbn(9782843033452)).toBe('9782843033452')
  })

  it('normalise null/undefined/vide en chaîne vide', () => {
    expect(normalizeIsbn(null)).toBe('')
    expect(normalizeIsbn(undefined)).toBe('')
    expect(normalizeIsbn('')).toBe('')
  })
})

describe('parseRouterWorkbook', () => {
  it('lit un EAN 13 chiffres pleine précision, sans perte (au-delà de 2^32, sous Number.MAX_SAFE_INTEGER)', () => {
    const buffer = routerWorkbook([[9782843033452, 'Gaza, génocide annoncé', 'Achcar, Gilbert', 'ignoré', 45793, 56]])
    const rows = parseRouterWorkbook(buffer)
    expect(rows).toEqual([{ isbn: '9782843033452', titre: 'Gaza, génocide annoncé', stock: 56 }])
  })

  it('lit un code non-ISBN à 13 chiffres (anciens titres, préfixe "12…") comme un EAN normal', () => {
    const buffer = routerWorkbook([[1214831748116, 'Principes fondamentaux d’économie politique', 'Baby, Jean', 'ignoré', 17899, 0]])
    const rows = parseRouterWorkbook(buffer)
    expect(rows).toEqual([{ isbn: '1214831748116', titre: 'Principes fondamentaux d’économie politique', stock: 0 }])
  })

  it('ignore les colonnes AUT/ABR/PUB (hors périmètre du stock)', () => {
    const buffer = routerWorkbook([[9782843033452, 'Titre', 'Nom, Prénom', 'Libellé routeur', 45793, 12]])
    const [row] = parseRouterWorkbook(buffer)
    expect(row).not.toHaveProperty('aut')
    expect(row).not.toHaveProperty('abr')
    expect(row).not.toHaveProperty('pub')
  })

  it("ramène un FIN négatif à 0 (constaté sur le fichier réel — artefact de compta routeur, jamais un stock physique)", () => {
    const buffer = routerWorkbook([[9782353670178, 'L’idéologie allemande', 'Marx, Karl', 'x', 41928, -1]])
    const [row] = parseRouterWorkbook(buffer)
    expect(row.stock).toBe(0)
  })

  it('lève une erreur explicite si la feuille "Feuille1" est absente', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['EAN', 'FIN'], [123, 1]])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'AutreFeuille')
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' }) as Buffer
    expect(() => parseRouterWorkbook(buffer)).toThrow(/Feuille1/)
  })
})

describe('matchStock', () => {
  it('apparie par ISBN normalisé un EAN numérique pleine précision', () => {
    const routerRows = parseRouterWorkbook(routerWorkbook([[9782843033452, 'Gaza, génocide annoncé', 'Achcar, Gilbert', 'x', 45793, 56]]))
    const books = [book({ id: 1, slug: 'gaza-genocide-annonce', isbn: '9782843033452' })]

    const report = matchStock(routerRows, books)

    expect(report.matched).toEqual([{ bookId: 1, slug: 'gaza-genocide-annonce', title: 'gaza-genocide-annonce', stock: 56 }])
    expect(report.routerRowsWithoutBook).toBe(0)
    expect(report.manualBooksNotInFile).toEqual([])
    expect(report.routerBooksMissingFromFile).toEqual([])
  })

  it('apparie un code non-ISBN (13 chiffres, préfixe "12…") comme un ISBN normal', () => {
    const routerRows = parseRouterWorkbook(routerWorkbook([[1214831748116, 'Vieux titre', 'Baby, Jean', 'x', 17899, 3]]))
    const books = [book({ id: 2, slug: 'vieux-titre', isbn: '1214831748116' })]

    const report = matchStock(routerRows, books)

    expect(report.matched).toEqual([{ bookId: 2, slug: 'vieux-titre', title: 'vieux-titre', stock: 3 }])
  })

  it('apparie malgré un ISBN saisi avec tirets côté fiche', () => {
    const routerRows = parseRouterWorkbook(routerWorkbook([[9782353670369, 'Correspondance', 'Althusser, Louis', 'x', 43216, 0]]))
    const books = [book({ id: 3, slug: 'correspondance', isbn: '978-2-35367-036-9' })]

    const report = matchStock(routerRows, books)

    expect(report.matched).toEqual([{ bookId: 3, slug: 'correspondance', title: 'correspondance', stock: 0 }])
    expect(report.manualBooksNotInFile).toEqual([])
  })

  it('compte une ligne routeur inconnue sans la lister (backlist papier, normal)', () => {
    const routerRows = parseRouterWorkbook(
      routerWorkbook([[9780000000000, 'Titre backlist papier pur', 'Auteur, Un', 'x', 1, 10]]),
    )
    const books: BookRef[] = []

    const report = matchStock(routerRows, books)

    expect(report.routerRowsWithoutBook).toBe(1)
    expect(report.matched).toEqual([])
    expect(report.manualBooksNotInFile).toEqual([])
    expect(report.routerBooksMissingFromFile).toEqual([])
  })

  it("classe une fiche en suivi manuel absente du fichier en information — NORMAL, plus une alerte (décision client du 12/07)", () => {
    const routerRows = parseRouterWorkbook(routerWorkbook([[9782843033452, 'Autre titre', 'Autre, Auteur', 'x', 1, 5]]))
    const books = [book({ id: 4, slug: 'hors-routeur-assume', isbn: '9781111111111', stockSuivi: 'manuel' })]

    const report = matchStock(routerRows, books)

    expect(report.matched).toEqual([])
    expect(report.routerRowsWithoutBook).toBe(1)
    expect(report.manualBooksNotInFile).toEqual([{ id: 4, slug: 'hors-routeur-assume', title: 'hors-routeur-assume', isbn: '9781111111111' }])
    expect(report.routerBooksMissingFromFile).toEqual([])
  })

  it("signale une fiche ANCIENNEMENT suivie routeur absente du nouveau fichier — LA vraie alerte (titre disparu du routeur)", () => {
    const routerRows = parseRouterWorkbook(routerWorkbook([[9782843033452, 'Autre titre', 'Autre, Auteur', 'x', 1, 5]]))
    const books = [book({ id: 5, slug: 'disparu-du-routeur', isbn: '9782222222222', stockSuivi: 'routeur' })]

    const report = matchStock(routerRows, books)

    expect(report.matched).toEqual([])
    expect(report.routerBooksMissingFromFile).toEqual([{ id: 5, slug: 'disparu-du-routeur', title: 'disparu-du-routeur', isbn: '9782222222222' }])
    expect(report.manualBooksNotInFile).toEqual([])
  })

  it("traite un stockSuivi legacy null comme « manuel » (fiche d'avant le champ — même défaut que le schéma)", () => {
    const routerRows = parseRouterWorkbook(routerWorkbook([[9782843033452, 'Autre titre', 'Autre, Auteur', 'x', 1, 5]]))
    const books = [book({ id: 6, slug: 'fiche-legacy', isbn: '9783333333333', stockSuivi: null })]

    const report = matchStock(routerRows, books)

    expect(report.manualBooksNotInFile).toEqual([{ id: 6, slug: 'fiche-legacy', title: 'fiche-legacy', isbn: '9783333333333' }])
    expect(report.routerBooksMissingFromFile).toEqual([])
  })

  it('classe aussi une fiche en ligne sans ISBN du tout (jamais matchable par construction) selon son mode de suivi', () => {
    const routerRows = parseRouterWorkbook(routerWorkbook([[9782843033452, 'Autre titre', 'Autre, Auteur', 'x', 1, 5]]))
    const books = [
      book({ id: 7, slug: 'sans-isbn-manuel', isbn: null, stockSuivi: 'manuel' }),
      book({ id: 8, slug: 'sans-isbn-routeur', isbn: null, stockSuivi: 'routeur' }),
    ]

    const report = matchStock(routerRows, books)

    expect(report.manualBooksNotInFile).toEqual([{ id: 7, slug: 'sans-isbn-manuel', title: 'sans-isbn-manuel', isbn: null }])
    expect(report.routerBooksMissingFromFile).toEqual([{ id: 8, slug: 'sans-isbn-routeur', title: 'sans-isbn-routeur', isbn: null }])
  })

  it("une fiche routeur PRÉSENTE dans le fichier reste un simple appariement — aucune alerte", () => {
    const routerRows = parseRouterWorkbook(routerWorkbook([[9784444444444, 'Titre suivi', 'Auteur, Un', 'x', 1, 9]]))
    const books = [book({ id: 9, slug: 'titre-suivi', isbn: '9784444444444', stockSuivi: 'routeur' })]

    const report = matchStock(routerRows, books)

    expect(report.matched).toEqual([{ bookId: 9, slug: 'titre-suivi', title: 'titre-suivi', stock: 9 }])
    expect(report.routerBooksMissingFromFile).toEqual([])
    expect(report.manualBooksNotInFile).toEqual([])
  })
})
