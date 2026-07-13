import type { StockImportReport } from './stock-import-core.ts'

/**
 * Cœur pur du rapport CSV d'un run d'import routeur (panneau 3.7 du dashboard
 * v2, `_specs/dashboard-admin/design-v2.md`) : relit le `StockImportReport`
 * sérialisé dans `import-runs.rapport` et le met en forme pour téléchargement.
 * Zéro I/O — l'orchestration vit dans `import-run-report-handler.ts`, même
 * découpage que `order-export.ts` / `order-export-handler.ts`.
 *
 * Convention CSV maison (cf. `src/lib/order-export.ts`) : séparateur `;`,
 * CRLF, échappement RFC 4180 — le BOM UTF-8 est ajouté par le handler à la
 * réponse HTTP, pas ici. (Pas de décimale dans ce rapport : uniquement des
 * comptes entiers et du texte.)
 */

const DELIMITER = ';'
const LINE_BREAK = '\r\n'

/** Échappe une cellule CSV (RFC 4180) — même règle que `order-export.ts`. */
function escapeCsvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(DELIMITER))
  return lines.join(LINE_BREAK) + LINE_BREAK
}

interface ReportBookEntry {
  title: string
  isbn: string | null
  slug: string
}

function isBookEntryArray(value: unknown): value is ReportBookEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ReportBookEntry).title === 'string' &&
        typeof (entry as ReportBookEntry).slug === 'string',
    )
  )
}

/**
 * Relit un `rapport` JSON stocké en base vers la forme `StockImportReport` —
 * `null` si la forme ne correspond pas (donnée corrompue/écrite par une autre
 * version du code) : l'appelant répond alors une erreur propre plutôt qu'un
 * CSV mensonger.
 */
export function parseStoredImportReport(value: unknown): StockImportReport | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<StockImportReport>
  if (
    !Array.isArray(candidate.matched) ||
    typeof candidate.routerRowsWithoutBook !== 'number' ||
    !isBookEntryArray(candidate.manualBooksNotInFile) ||
    !isBookEntryArray(candidate.routerBooksMissingFromFile)
  ) {
    return null
  }
  return candidate as StockImportReport
}

const RAPPORT_HEADER = ['Section', 'Titre', 'ISBN', 'Slug'] as const

const SECTION_ROUTEUR_DISPARU =
  'Fiche suivie routeur absente du fichier (alerte — titre disparu du routeur)'
const SECTION_MANUEL = 'Fiche en suivi manuel absente du fichier (informatif, normal)'
const SECTION_BACKLIST = 'Lignes routeur sans fiche en ligne (backlist, normal)'

/**
 * CSV des non-appariés d'un run — les deux listes nominatives (alerte routeur
 * d'abord, informatif manuel ensuite) puis une ligne de synthèse pour les
 * lignes routeur sans fiche (le rapport n'en conserve que le compte, cf.
 * `StockImportReport.routerRowsWithoutBook`). Les fiches appariées n'y
 * figurent pas : elles sont le cas nominal, déjà comptées dans `nbMatchees`.
 */
export function formatImportRunReportCsv(report: StockImportReport): string {
  const bookRow = (section: string, entry: ReportBookEntry): string[] => [
    section,
    entry.title,
    entry.isbn ?? '',
    entry.slug,
  ]

  const rows = [
    ...report.routerBooksMissingFromFile.map((entry) => bookRow(SECTION_ROUTEUR_DISPARU, entry)),
    ...report.manualBooksNotInFile.map((entry) => bookRow(SECTION_MANUEL, entry)),
    [SECTION_BACKLIST, `${report.routerRowsWithoutBook} ligne(s) du fichier routeur`, '', ''],
  ]
  return toCsv(RAPPORT_HEADER, rows)
}
