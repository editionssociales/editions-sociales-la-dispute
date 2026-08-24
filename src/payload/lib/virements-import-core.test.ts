import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import {
  matchPalier,
  parseDateCell,
  parseMontantEuros,
  parseVirementsWorkbook,
} from './virements-import-core.ts'

/**
 * Fabrique un classeur .xlsx en mémoire — jamais le vrai fichier de l'équipe.
 * Les fixtures reproduisent ce qu'un classeur tenu à la main contient
 * vraiment : en-têtes accentués/majuscules, ligne de titre avant l'en-tête,
 * montants texte, dates en trois formes.
 */
function workbook(grid: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(grid)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Suivi')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

const HEADER = ['Date', 'Nom', 'Montant (€)', 'Choix de la souscription']

describe('parseMontantEuros', () => {
  it('accepte un nombre de cellule', () => {
    expect(parseMontantEuros(50)).toBe(50)
    expect(parseMontantEuros(37.5)).toBe(37.5)
  })

  it('accepte une saisie française avec symbole et espace insécable', () => {
    expect(parseMontantEuros('50,00 €')).toBe(50)
    expect(parseMontantEuros('1 000,50 €')).toBe(1000.5)
  })

  it('quand virgule et point cohabitent, le DERNIER est le séparateur décimal', () => {
    expect(parseMontantEuros('1.000,50')).toBe(1000.5)
    expect(parseMontantEuros('1,000.50')).toBe(1000.5)
  })

  it('refuse zéro, négatif et illisible (jamais un contributeur fantôme dans la jauge)', () => {
    expect(parseMontantEuros(0)).toBeNull()
    expect(parseMontantEuros(-20)).toBeNull()
    expect(parseMontantEuros('à venir')).toBeNull()
    expect(parseMontantEuros(null)).toBeNull()
  })
})

describe('parseDateCell', () => {
  it('lit une cellule date sans dérive de fuseau (accesseurs locaux, jamais toISOString)', () => {
    expect(parseDateCell(new Date(2026, 7, 24))).toBe('2026-08-24')
  })

  it('lit un sérial Excel', () => {
    // 24/08/2026 → sérial 46258 (base 1900 d'Excel).
    expect(parseDateCell(46258)).toBe('2026-08-24')
  })

  it('lit du texte français et ISO', () => {
    expect(parseDateCell('24/08/2026')).toBe('2026-08-24')
    expect(parseDateCell('24-08-2026')).toBe('2026-08-24')
    expect(parseDateCell('2026-08-24')).toBe('2026-08-24')
  })

  it('refuse ce qui n’est pas une date', () => {
    expect(parseDateCell('août')).toBeNull()
    expect(parseDateCell('')).toBeNull()
    expect(parseDateCell(undefined)).toBeNull()
  })
})

describe('matchPalier', () => {
  it('reconnaît un palier par son intitulé, accents et casse indifférents', () => {
    expect(matchPalier('Camarade de lecture')).toBe('palier-50')
    expect(matchPalier('CAMARADE DE LA PREMIÈRE HEURE')).toBe('palier-200')
  })

  it('reconnaît un palier par son montant', () => {
    expect(matchPalier('35 €')).toBe('palier-35')
    expect(matchPalier('palier 1000')).toBe('palier-1000')
  })

  it('cellule remplie mais non reconnue → « autre » ; cellule vide → null', () => {
    expect(matchPalier('ils verront plus tard')).toBe('autre')
    expect(matchPalier('')).toBeNull()
    expect(matchPalier(null)).toBeNull()
  })
})

describe('parseVirementsWorkbook', () => {
  it('lit les colonnes convenues avec le client, quel que soit leur ordre', () => {
    const buffer = workbook([
      ['Choix de la souscription', 'MONTANT', 'Nom', 'Date'],
      ['Camarade de lecture', '50,00 €', 'Marie Dupont', '24/08/2026'],
    ])
    const { rows, issues } = parseVirementsWorkbook(buffer)
    expect(issues).toEqual([])
    expect(rows).toEqual([
      {
        cleImport: '2026-08-24|marie dupont|50.00',
        date: '2026-08-24',
        nom: 'Marie Dupont',
        montantEUR: 50,
        palier: 'palier-50',
        choixSaisi: 'Camarade de lecture',
        email: null,
        reference: null,
      },
    ])
  })

  it('saute une ligne de titre avant l’en-tête et les lignes vides', () => {
    const buffer = workbook([
      ['Souscription 2026 — virements'],
      [],
      HEADER,
      ['24/08/2026', 'Marie Dupont', 50, 'Coup de pouce'],
      [],
      ['25/08/2026', 'Jean Martin', 100, ''],
    ])
    const { rows, issues } = parseVirementsWorkbook(buffer)
    expect(issues).toEqual([])
    expect(rows.map((row) => row.nom)).toEqual(['Marie Dupont', 'Jean Martin'])
    expect(rows[1].palier).toBeNull()
  })

  it('écarte une ligne inexploitable en la NOMMANT par son numéro de ligne Excel, sans perdre les autres', () => {
    const buffer = workbook([
      HEADER,
      ['24/08/2026', 'Marie Dupont', 50, ''],
      ['', 'Jean Martin', 100, ''],
      ['26/08/2026', '', 100, ''],
      ['27/08/2026', 'Alex Roy', 'à venir', ''],
    ])
    const { rows, issues } = parseVirementsWorkbook(buffer)
    expect(rows).toHaveLength(1)
    expect(issues.map((issue) => issue.ligne)).toEqual([3, 4, 5])
    expect(issues[0].raison).toContain('date')
    expect(issues[1].raison).toContain('nom')
    expect(issues[2].raison).toContain('montant')
  })

  it('deux virements identiques le même jour restent deux lignes (clés distinctes)', () => {
    const buffer = workbook([
      HEADER,
      ['24/08/2026', 'Marie Dupont', 50, ''],
      ['24/08/2026', 'Marie Dupont', 50, ''],
    ])
    const { rows } = parseVirementsWorkbook(buffer)
    expect(rows.map((row) => row.cleImport)).toEqual([
      '2026-08-24|marie dupont|50.00',
      '2026-08-24|marie dupont|50.00|2',
    ])
  })

  it('la clé d’import est stable d’un ré-import à l’autre malgré la forme de la cellule', () => {
    const texte = parseVirementsWorkbook(workbook([HEADER, ['24/08/2026', 'Marie Dupont', '50 €', '']]))
    const nombres = parseVirementsWorkbook(
      workbook([HEADER, [new Date(2026, 7, 24), ' Marie  Dupont ', 50, '']]),
    )
    expect(nombres.rows[0].cleImport).toBe(texte.rows[0].cleImport)
  })

  it('colonnes facultatives e-mail et notes reprises quand elles existent', () => {
    const buffer = workbook([
      [...HEADER, 'E-mail', 'Notes'],
      ['24/08/2026', 'Marie Dupont', 50, 'Coup de pouce', 'marie@exemple.fr', 'virement du 24'],
    ])
    const { rows } = parseVirementsWorkbook(buffer)
    expect(rows[0].email).toBe('marie@exemple.fr')
    expect(rows[0].reference).toBe('virement du 24')
  })

  it('sans colonnes « nom » et « montant », jette un message adressé à l’équipe (jamais un silencieux « 0 ligne »)', () => {
    expect(() => parseVirementsWorkbook(workbook([['Prénom', 'Somme perçue'], ['Marie', 50]]))).toThrow(
      /nom[\s\S]*montant/,
    )
  })
})
