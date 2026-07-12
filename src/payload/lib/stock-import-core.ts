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
}

export interface StockImportReport {
  /** Fiches appariées — l'appelant y lit `bookId`/`stock` pour écrire `commerce.stock`. */
  matched: { bookId: number; slug: string; title: string; stock: number }[]
  /** Compte seulement (Y) : lignes du routeur qui ne correspondent à aucune fiche en ligne — normal, le fichier couvre aussi le fonds papier pur (cf. mission). */
  routerRowsWithoutBook: number
  /** L'alerte qui compte (Z) : fiches en ligne (hors boutique) absentes du fichier routeur — ISBN manquant ou non reconnu par le routeur ce mois-ci. */
  missingOnlineBooks: { id: number; slug: string; title: string; isbn: string | null }[]
}

/**
 * Apparie chaque ligne du routeur aux fiches par ISBN normalisé. `books` est
 * déjà filtré par l'appelant (`origin: 'catalogue'` uniquement — jamais la
 * boutique/les goodies, mission point 3) : cette fonction ne connaît pas la
 * notion d'origine, juste la liste qu'on lui donne.
 *
 * Une fiche sans ISBN (ou dont l'ISBN ne matche aucune ligne) tombe
 * naturellement dans `missingOnlineBooks` : la clé normalisée d'un ISBN vide
 * ne collisionne jamais avec un EAN routeur (toujours un nombre), aucun cas
 * particulier n'est nécessaire. Un ISBN partagé par plusieurs fiches (données
 * existantes, non attendu) met à jour toutes les fiches candidates plutôt que
 * d'en arbitrer une — défaut conservateur.
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

  const missingOnlineBooks = books
    .filter((book) => !matchedIds.has(book.id))
    .map((book) => ({ id: book.id, slug: book.slug, title: book.title, isbn: book.isbn }))

  return { matched, routerRowsWithoutBook, missingOnlineBooks }
}
