import { describe, expect, it } from 'vitest'

import { formatImportRunReportCsv, parseStoredImportReport } from './import-run-report-core.ts'
import type { StockImportReport } from './stock-import-core.ts'

const report: StockImportReport = {
  matched: [{ bookId: 1, slug: 'la-sainte-famille', title: 'La Sainte Famille', stock: 4 }],
  routerRowsWithoutBook: 43,
  manualBooksNotInFile: [
    { id: 2, slug: 'tote-bag', title: 'Tote bag ; édition limitée', isbn: null },
  ],
  routerBooksMissingFromFile: [
    { id: 3, slug: 'manuscrits-de-1844', title: 'Manuscrits de 1844', isbn: '978-2-35367-036-9' },
  ],
}

describe('parseStoredImportReport', () => {
  it('accepte un rapport bien formé (aller-retour JSON compris)', () => {
    expect(parseStoredImportReport(JSON.parse(JSON.stringify(report)))).toEqual(report)
  })

  it('refuse les formes inattendues — jamais un CSV mensonger', () => {
    expect(parseStoredImportReport(null)).toBeNull()
    expect(parseStoredImportReport('csv')).toBeNull()
    expect(parseStoredImportReport({})).toBeNull()
    expect(parseStoredImportReport({ ...report, routerRowsWithoutBook: 'douze' })).toBeNull()
    expect(parseStoredImportReport({ ...report, manualBooksNotInFile: [{ id: 9 }] })).toBeNull()
  })
})

describe('formatImportRunReportCsv', () => {
  it('liste l’alerte routeur d’abord, l’informatif ensuite, la synthèse backlist en dernier — CSV maison (`;`, CRLF, RFC 4180)', () => {
    const lines = formatImportRunReportCsv(report).split('\r\n')
    expect(lines[0]).toBe('Section;Titre;ISBN;Slug')
    expect(lines[1]).toBe(
      'Fiche suivie routeur absente du fichier (alerte — titre disparu du routeur);Manuscrits de 1844;978-2-35367-036-9;manuscrits-de-1844',
    )
    // Le « ; » du titre est échappé (cellule entre guillemets), l'ISBN null devient vide.
    expect(lines[2]).toBe(
      'Fiche en suivi manuel absente du fichier (informatif, normal);"Tote bag ; édition limitée";;tote-bag',
    )
    expect(lines[3]).toBe(
      'Lignes routeur sans fiche en ligne (backlist, normal);43 ligne(s) du fichier routeur;;',
    )
    // CRLF final, pas de ligne fantôme au-delà.
    expect(lines[4]).toBe('')
    expect(lines).toHaveLength(5)
  })
})
