import * as XLSX from 'xlsx'

/**
 * Cœur pur de l'import stock routeur (endpoint `POST /api/books/import-stock`,
 * `stock-import.ts`) : lecture du classeur .xls + appariement par ISBN
 * normalisé. Aucune I/O réseau/DB ici — le classeur arrive déjà en `Buffer`,
 * les fiches déjà chargées par l'appelant — c'est la surface couverte par
 * `stock-import-core.test.ts` (même découpage pur/impur que
 * `migrate-products-core.ts`/`migrate-products.ts`).
 */

const ROUTER_SHEET_NAME = 'Feuille1'

/**
 * Ne garde que les chiffres : un EAN routeur (toujours numérique) et un ISBN
 * de fiche (parfois saisi « 978-2-35367-036-9 », héritage WordPress)
 * normalisent à la même clé dès qu'ils désignent le même livre.
 */
export function normalizeIsbn(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\D/g, '')
}

/** Ligne du fichier routeur telle que retournée par `sheet_to_json` (colonnes ABR/AUT/PUB ignorées, hors périmètre du stock). */
interface RouterFileRow {
  EAN?: number | string
  TIT?: string
  FIN?: number
}

export interface RouterStockRow {
  /** EAN normalisé (chiffres uniquement) — clé d'appariement contre `Books.isbn`. */
  isbn: string
  /** Titre routeur — contexte humain pour le rapport, jamais utilisé pour l'appariement. */
  titre: string
  /** Stock déclaré par le routeur : écrase `commerce.stock` de la fiche appariée (le fichier fait foi). */
  stock: number
}

/**
 * Lit le classeur .xls du routeur (BIFF, une seule feuille "Feuille1" —
 * colonnes EAN, TIT, AUT, ABR, PUB, FIN). `raw: true` conserve l'EAN en
 * entier JS pleine précision (13 chiffres, largement sous
 * `Number.MAX_SAFE_INTEGER`) plutôt qu'une chaîne mise en forme par la
 * feuille. Lignes sans EAN exploitable écartées (silencieuses — un export
 * routeur n'a jamais de ligne sans code produit, cf. mission).
 *
 * `FIN` négatif ramené à 0 (constaté sur le fichier réel du 06/07 — EAN
 * 9782353670178, `FIN: -1` : artefact de compta routeur, jamais un stock
 * physique) — `commerce.stock` est contraint `min: 0` (`Books.ts`), un
 * négatif ferait échouer l'écriture pour toute la fiche.
 */
export function parseRouterWorkbook(buffer: Buffer): RouterStockRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true })
  const sheet = workbook.Sheets[ROUTER_SHEET_NAME]
  if (!sheet) {
    throw new Error(`Feuille "${ROUTER_SHEET_NAME}" introuvable dans le fichier routeur.`)
  }
  const rows = XLSX.utils.sheet_to_json<RouterFileRow>(sheet, { raw: true })
  return rows
    .map((row) => ({
      isbn: normalizeIsbn(row.EAN ?? null),
      titre: String(row.TIT ?? '').trim(),
      stock: Math.max(0, Number(row.FIN ?? 0)),
    }))
    .filter((row) => row.isbn !== '')
}

/** Fiche minimale nécessaire à l'appariement — extraite du document Payload par l'appelant (`stock-import.ts`). */
export interface BookRef {
  id: number
  slug: string
  title: string
  /** Valeur brute du champ Payload — peut contenir espaces/tirets (héritage WordPress) ; normalisée ici avant comparaison. */
  isbn: string | null
  /**
   * Mode de suivi courant de la fiche (`commerce.stockSuivi`) — `null`
   * (fiche d'avant le champ) traité comme `'manuel'`, même défaut que le
   * schéma. C'est lui qui classe une fiche absente du fichier : « manuel »
   * = normal (fallback goodies, décision client du 12/07), « routeur » =
   * l'alerte qui compte (titre disparu du routeur).
   */
  stockSuivi: 'routeur' | 'manuel' | null
}

export interface StockImportReport {
  /** Fiches appariées — l'appelant y lit `bookId`/`stock` pour écrire `commerce.stock` et poser `stockSuivi: 'routeur'`. */
  matched: { bookId: number; slug: string; title: string; stock: number }[]
  /** Compte seulement (Y) : lignes du routeur qui ne correspondent à aucune fiche en ligne — normal, le fichier couvre aussi le fonds papier pur (cf. mission). */
  routerRowsWithoutBook: number
  /**
   * Fiches en suivi manuel absentes du fichier — NORMAL (plus une alerte,
   * décision client du 12/07 : hors routeur = fallback manuel, comme les
   * goodies). Listées à titre informatif seulement.
   */
  manualBooksNotInFile: { id: number; slug: string; title: string; isbn: string | null }[]
  /**
   * LA vraie alerte : fiches ANCIENNEMENT suivies routeur (`stockSuivi:
   * 'routeur'`) absentes du nouveau fichier — titre disparu du routeur.
   * L'appelant n'y touche pas (stock conservé tel quel, `stockSuivi` reste
   * `'routeur'`) : l'alerte persiste au prochain import tant que l'anomalie
   * n'est pas résolue (correction du fichier ou passage manuel assumé).
   */
  routerBooksMissingFromFile: { id: number; slug: string; title: string; isbn: string | null }[]
}

/**
 * Apparie chaque ligne du routeur aux fiches par ISBN normalisé. `books` est
 * déjà filtré par l'appelant (`origin: 'catalogue'` uniquement — jamais la
 * boutique/les goodies, mission point 3) : cette fonction ne connaît pas la
 * notion d'origine, juste la liste qu'on lui donne.
 *
 * Une fiche sans ISBN (ou dont l'ISBN ne matche aucune ligne) tombe
 * naturellement hors appariement : la clé normalisée d'un ISBN vide ne
 * collisionne jamais avec un EAN routeur (toujours un nombre), aucun cas
 * particulier n'est nécessaire. Elle est ensuite classée selon son mode de
 * suivi : « manuel » (ou legacy `null`) → information, « routeur » → alerte.
 * Un ISBN partagé par plusieurs fiches (données existantes, non attendu) met
 * à jour toutes les fiches candidates plutôt que d'en arbitrer une — défaut
 * conservateur.
 */
export function matchStock(routerRows: RouterStockRow[], books: BookRef[]): StockImportReport {
  const byIsbn = new Map<string, BookRef[]>()
  for (const book of books) {
    const key = normalizeIsbn(book.isbn)
    const bucket = byIsbn.get(key)
    if (bucket) {
      bucket.push(book)
    } else {
      byIsbn.set(key, [book])
    }
  }

  const matched: StockImportReport['matched'] = []
  const matchedIds = new Set<number>()
  let routerRowsWithoutBook = 0

  for (const row of routerRows) {
    const candidates = byIsbn.get(row.isbn)
    if (!candidates || candidates.length === 0) {
      routerRowsWithoutBook += 1
      continue
    }
    for (const book of candidates) {
      matched.push({ bookId: book.id, slug: book.slug, title: book.title, stock: row.stock })
      matchedIds.add(book.id)
    }
  }

  const manualBooksNotInFile: StockImportReport['manualBooksNotInFile'] = []
  const routerBooksMissingFromFile: StockImportReport['routerBooksMissingFromFile'] = []
  for (const book of books) {
    if (matchedIds.has(book.id)) continue
    const entry = { id: book.id, slug: book.slug, title: book.title, isbn: book.isbn }
    if (book.stockSuivi === 'routeur') {
      routerBooksMissingFromFile.push(entry)
    } else {
      manualBooksNotInFile.push(entry)
    }
  }

  return { matched, routerRowsWithoutBook, manualBooksNotInFile, routerBooksMissingFromFile }
}
