import * as XLSX from 'xlsx'

import { DONATION_TIERS, type DonationTierId } from '../../lib/donation-tiers.ts'

/**
 * Cœur pur de l'import des virements de souscription (endpoint `POST
 * /api/virements-souscription/import`, `virements-import.ts`) : lecture du
 * classeur Excel tenu par l'équipe et normalisation de ses lignes. Aucune I/O
 * réseau/DB ici — le classeur arrive déjà en `Buffer` — même découpage
 * pur/impur que `stock-import-core.ts`/`stock-import.ts`.
 *
 * Contrat de colonnes (arbitrage client 2026-08-24, fil WhatsApp Clara/Youri :
 * « nom, montant, choix de la souscription ? » / « Yes et date ») : **nom ·
 * montant · choix de la souscription · date**, plus deux colonnes
 * facultatives tolérées (e-mail, référence/notes). Le fichier est tenu à la
 * main : rien n'y est garanti — ni l'ordre des colonnes, ni la casse ou les
 * accents des en-têtes, ni la présence d'une ligne de titre avant l'en-tête,
 * ni le format des montants (« 50 », « 50,00 € », « 1 000 ») ou des dates
 * (cellule date Excel, sérial, ou texte `24/08/2026`). Tout est donc apparié
 * de façon tolérante, et chaque ligne inexploitable ressort en `issues`
 * (jamais silencieusement écartée : l'équipe doit pouvoir corriger SA ligne).
 */

/** Une ligne de virement exploitable, normalisée — la forme écrite en base (`virements-souscription`). */
export interface VirementRow {
  /**
   * Clé d'idempotence d'un ré-import du MÊME fichier (le classeur est
   * cumulatif : on le réimporte à chaque ajout) — `date|nom|montant`, plus un
   * rang d'occurrence pour ne pas confondre deux virements réellement
   * identiques le même jour (`…|2`, `…|3`).
   */
  cleImport: string
  /** `YYYY-MM-DD` — jour du virement, jamais un instant (cf. `virements-import.ts` pour le midi UTC posé à l'écriture). */
  date: string
  nom: string
  /** Euros (mêmes unités que `Orders.totalTTC`, cf. `Orders.ts`). */
  montantEUR: number
  /** Palier reconnu dans la colonne « choix », `autre` si la cellule est remplie sans correspondre, `null` si elle est vide. */
  palier: DonationTierId | 'autre' | null
  /** Cellule « choix » telle que saisie — conservée même quand `palier` la reconnaît (rien du fichier n'est perdu). */
  choixSaisi: string | null
  email: string | null
  reference: string | null
}

/** Une ligne écartée, avec son numéro de ligne DANS LE CLASSEUR (1-based, tel qu'affiché par Excel) et la raison — destinée à l'équipe, pas à un log. */
export interface VirementIssue {
  ligne: number
  raison: string
}

export interface VirementsParseResult {
  rows: VirementRow[]
  issues: VirementIssue[]
}

/**
 * Normalise un en-tête ou un libellé pour l'appariement : sans accents, en
 * minuscules, ponctuation et blancs (dont l'espace insécable) réduits à un
 * seul espace. « Montant (€) », « MONTANT », « montant  » → `montant`.
 */
export function normalizeLabel(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9€]+/g, ' ')
    .trim()
}

/**
 * Synonymes acceptés par colonne, en-têtes DÉJÀ normalisés
 * (`normalizeLabel`). Appariement par PRÉFIXE : « montant en euros » comme
 * « montant € » tombent sur `montant`. L'ordre compte — `date` est testé
 * avant `nom` etc. ; une colonne déjà appariée n'est jamais réattribuée.
 */
const COLUMN_SYNONYMS = {
  date: ['date'],
  nom: ['nom', 'prenom nom', 'contributeur', 'contributrice', 'souscripteur', 'souscriptrice'],
  montant: ['montant', 'somme', 'versement', 'virement'],
  choix: ['choix', 'palier', 'souscription', 'contrepartie', 'formule'],
  email: ['email', 'e mail', 'mail', 'courriel', 'adresse mail'],
  reference: ['reference', 'notes', 'note', 'commentaire', 'libelle', 'remarque'],
} as const satisfies Record<string, readonly string[]>

type ColumnKey = keyof typeof COLUMN_SYNONYMS

/** Index de colonne par rôle — `undefined` quand la colonne est absente du fichier. */
type ColumnMap = Partial<Record<ColumnKey, number>>

/**
 * Apparie les cellules d'une ligne candidate à des rôles de colonne. Une
 * ligne n'est un en-tête que si elle porte AU MOINS `nom` et `montant` : un
 * classeur qui commence par un titre (« Souscription 2026 ») ou une ligne
 * vide ne fait pas dérailler la lecture.
 */
function matchHeaderRow(cells: unknown[]): ColumnMap | null {
  const map: ColumnMap = {}
  const taken = new Set<ColumnKey>()
  cells.forEach((cell, index) => {
    const label = normalizeLabel(cell)
    if (!label) return
    for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS) as [ColumnKey, readonly string[]][]) {
      if (taken.has(key)) continue
      if (synonyms.some((synonym) => label === synonym || label.startsWith(`${synonym} `))) {
        map[key] = index
        taken.add(key)
        return
      }
    }
  })
  return map.nom !== undefined && map.montant !== undefined ? map : null
}

/**
 * Montant → euros. Accepte un nombre Excel, ou du texte saisi à la main :
 * symbole monétaire, espaces (dont insécables) et séparateurs de milliers
 * tolérés. Quand `,` et `.` cohabitent, le DERNIER des deux est le séparateur
 * décimal (« 1.000,50 » comme « 1,000.50 ») ; seul, `,` est décimal (saisie
 * française) et `.` l'est aussi. `null` si rien d'exploitable ou si le
 * montant n'est pas strictement positif.
 */
export function parseMontantEuros(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null
  }
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^\d,.-]/g, '')
  if (!cleaned) return null
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const decimalAt = Math.max(lastComma, lastDot)
  const normalized =
    decimalAt === -1
      ? cleaned
      : `${cleaned.slice(0, decimalAt).replace(/[,.]/g, '')}.${cleaned.slice(decimalAt + 1).replace(/[,.]/g, '')}`
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null
}

/** `YYYY-MM-DD` depuis trois entiers — zéro-padding, aucun `Date` intermédiaire (pas de dérive de fuseau). */
function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Date → `YYYY-MM-DD`. Trois formes réelles dans un classeur : cellule date
 * (`cellDates: true` → `Date` construite en heure LOCALE par la lib, d'où les
 * accesseurs locaux — jamais `toISOString()`, qui décalerait d'un jour à
 * l'ouest de Greenwich), sérial Excel (nombre), ou texte
 * `24/08/2026`/`24-08-2026`/`2026-08-24`. `null` sinon.
 */
export function parseDateCell(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    return parsed ? isoDate(parsed.y, parsed.m, parsed.d) : null
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text)
  if (!fr) return null
  const year = Number(fr[3])
  return isoDate(year < 100 ? 2000 + year : year, Number(fr[2]), Number(fr[1]))
}

/**
 * Reconnaît le palier derrière la cellule « choix de la souscription ».
 * Deux voies, dans cet ordre : l'intitulé du palier (« Camarade de lecture »)
 * puis son montant (« 50 € », « palier 50 »). Cellule remplie mais non
 * reconnue → `autre` (l'équipe voit la valeur brute à côté, rien n'est
 * inventé) ; cellule vide → `null`. Le montant VERSÉ n'est JAMAIS utilisé
 * pour deviner un palier : un virement de 50 € n'est pas nécessairement le
 * palier 50 (il peut être un montant libre), et la contrepartie à expédier ne
 * se déduit pas d'un chiffre.
 */
export function matchPalier(value: unknown): DonationTierId | 'autre' | null {
  const label = normalizeLabel(value)
  if (!label) return null
  const byTitle = DONATION_TIERS.find((tier) => label.includes(normalizeLabel(tier.title)))
  if (byTitle) return byTitle.id
  const amounts = label.match(/\d+/g)
  if (amounts) {
    const byAmount = DONATION_TIERS.find((tier) => amounts.includes(String(tier.amount)))
    if (byAmount) return byAmount.id
  }
  return 'autre'
}

/** Cellule texte facultative — `null` plutôt qu'une chaîne vide (le champ reste vide en base). */
function textCell(row: unknown[], index: number | undefined): string | null {
  if (index === undefined) return null
  const value = row[index]
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

/**
 * Lit le classeur des virements — PREMIÈRE feuille (le fichier est tenu par
 * l'équipe : son nom d'onglet n'est pas un contrat, contrairement au fichier
 * routeur), en-tête cherché sur les 20 premières lignes.
 *
 * Jette (message destiné à l'équipe, affiché tel quel dans le back-office)
 * quand le classeur est vide ou qu'aucune ligne d'en-tête ne porte au moins
 * « nom » et « montant » : sans ces deux colonnes, il n'y a rien à importer —
 * mieux vaut le dire que d'annoncer « 0 ligne importée ».
 */
export function parseVirementsWorkbook(buffer: Buffer): VirementsParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) {
    throw new Error('Classeur vide : aucune feuille lisible dans le fichier.')
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: true })

  let headerIndex = -1
  let columns: ColumnMap | null = null
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const match = matchHeaderRow(grid[i] ?? [])
    if (match) {
      headerIndex = i
      columns = match
      break
    }
  }
  if (!columns) {
    throw new Error(
      'Colonnes introuvables : le fichier doit comporter une ligne d’en-tête avec au moins ' +
        '« nom » et « montant » (colonnes attendues : date, nom, montant, choix de la souscription).',
    )
  }

  const rows: VirementRow[] = []
  const issues: VirementIssue[] = []
  /** Compteur d'occurrences par clé nue — deux virements identiques le même jour restent deux lignes. */
  const occurrences = new Map<string, number>()

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i] ?? []
    // Numéro de ligne tel qu'Excel l'affiche (1-based) — l'équipe corrige DANS son fichier.
    const ligne = i + 1
    if (cells.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')) {
      continue
    }

    const nom = textCell(cells, columns.nom)
    const montantEUR = parseMontantEuros(columns.montant === undefined ? null : cells[columns.montant])
    const date = parseDateCell(columns.date === undefined ? null : cells[columns.date])

    if (!nom) {
      issues.push({ ligne, raison: 'nom manquant' })
      continue
    }
    if (montantEUR === null) {
      issues.push({ ligne, raison: `montant illisible ou nul (${nom})` })
      continue
    }
    if (!date) {
      issues.push({
        ligne,
        raison: `date illisible ou manquante (${nom}) — formats acceptés : 24/08/2026, 2026-08-24, ou une cellule au format date`,
      })
      continue
    }

    const base = `${date}|${normalizeLabel(nom)}|${montantEUR.toFixed(2)}`
    const rank = (occurrences.get(base) ?? 0) + 1
    occurrences.set(base, rank)

    rows.push({
      cleImport: rank === 1 ? base : `${base}|${rank}`,
      date,
      nom,
      montantEUR,
      palier: matchPalier(columns.choix === undefined ? null : cells[columns.choix]),
      choixSaisi: textCell(cells, columns.choix),
      email: textCell(cells, columns.email),
      reference: textCell(cells, columns.reference),
    })
  }

  return { rows, issues }
}
