import { compactIsbn, isbn13FromIsbn } from './isbn.ts'

/**
 * Cœur pur de l'autofill des liens libraires (`buy.parislibrairies`,
 * `buy.lalibrairie`, `Books.ts`) depuis l'ISBN — zéro I/O, même découpage que
 * `stock-import-core.ts` (jumeau impur : `buy-links-resolve.ts` pour la
 * résolution réseau, `buy-links-autofill.ts` pour le hook Payload,
 * `scripts/backfill-buy-links.ts` pour la passe de rattrapage). Tests
 * exhaustifs dans `buy-links-core.test.ts`.
 *
 * Formats d'URL retenus (vérifiés empiriquement, mission liens libraires) :
 * - ParisLibrairies : la sonde `GET /livre/{ean13}` redirige (301) vers la
 *   fiche canonique `/livre/{ean13}-{slug}/` si le livre existe.
 * - LaLibrairie : pas de motif dérivable de l'EAN — l'id interne n'apparaît
 *   qu'après une recherche côté site (`buy-links-resolve.ts`). La fiche
 *   retenue matche toujours `/livres/…_{ean13}.html`.
 */

const PARISLIBRAIRIES_HOSTNAME = 'parislibrairies.fr'
const LALIBRAIRIE_HOSTNAME = 'lalibrairie.com'
export const LALIBRAIRIE_ORIGIN = 'https://www.lalibrairie.com'

/** URL sondée pour vérifier qu'un EAN est référencé chez ParisLibrairies. */
export function parisLibrairiesProbeUrl(ean13: string): string {
  return `https://www.parislibrairies.fr/livre/${ean13}`
}

/** Retire le préfixe (au sens hostname, `www.` compris) — `sub.domain.fr` matche `domain.fr`, jamais `otherdomain.fr`. */
function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * `true` ssi `url` est la fiche canonique ParisLibrairies de CET EAN —
 * consommé par `resolveParisLibrairiesUrl` pour valider la redirection finale
 * (jamais écrire un lien qui a atterri ailleurs qu'attendu, ex. cascade de
 * redirections vers une page 404 générique).
 */
export function isParisLibrairiesFicheUrl(url: string, ean13: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed || !hostnameMatches(parsed.hostname, PARISLIBRAIRIES_HOSTNAME)) return false
  return new RegExp(`^/livre/${ean13}(?:-|/|$)`).test(parsed.pathname)
}

/**
 * Jeton CSRF du formulaire de recherche rapide LaLibrairie
 * (`<input … name="token" … value="…">`, action `/livres/recherche.html`) —
 * parse tolérant à l'ordre des attributs : on isole d'abord la balise
 * `<input>`, puis on y cherche `name`/`value` indépendamment plutôt que de
 * figer leur ordre relatif dans un seul motif.
 */
export function extractLalibrairieToken(html: string): string | null {
  const inputTags = html.match(/<input\b[^>]*>/gi) ?? []
  for (const tag of inputTags) {
    if (!/\bname=["']token["']/i.test(tag)) continue
    const value = tag.match(/\bvalue=["']([^"']*)["']/i)
    if (value) return value[1]
  }
  return null
}

/**
 * Absolutise la `Location` du 302 de recherche LaLibrairie contre le site,
 * retire un préfixe `/index.php` éventuel ainsi que query/fragment, et
 * vérifie que le résultat matche bien une fiche livre DE CET EAN
 * (`/livres/{slug}_{id}_{ean13}.html`) — `null` sinon (redirection vers autre
 * chose qu'une fiche, ou fiche d'un autre livre).
 */
export function normalizeLalibrairieFicheUrl(location: string, ean13: string): string | null {
  let url: URL
  try {
    // Deuxième argument = base : absolutise une `Location` relative
    // (`/livres/…html`) sans effet sur une valeur déjà absolue.
    url = new URL(location, LALIBRAIRIE_ORIGIN)
  } catch {
    return null
  }

  const pathname = url.pathname.startsWith('/index.php/')
    ? url.pathname.slice('/index.php'.length)
    : url.pathname

  if (!new RegExp(`^/livres/[^/]*_${ean13}\\.html$`).test(pathname)) return null
  return `${LALIBRAIRIE_ORIGIN}${pathname}`
}

// Non exporté (`classifyBuyLinkValue`, exporté juste en dessous, est le seul
// point d'entrée consommé hors de ce fichier).
/** Classification d'une valeur de champ `buy.parislibrairies`/`buy.lalibrairie` existante. */
type BuyLinkClassification = 'empty' | 'paris-fiche' | 'paris-recherche' | 'lalibrairie-fiche' | 'autre'

/**
 * Classe une valeur de champ libraire — sert à la fois au plan d'autofill
 * (un lien devenu obsolète après changement d'ISBN) et au backfill (repérer
 * les liens legacy `listeliv.php`/inversions à corriger sans jamais toucher
 * une valeur `autre`, choix explicite de la cliente).
 */
export function classifyBuyLinkValue(value: string | null | undefined): BuyLinkClassification {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return 'empty'

  const parsed = parseUrl(trimmed)
  if (!parsed) return 'autre'

  if (hostnameMatches(parsed.hostname, PARISLIBRAIRIES_HOSTNAME)) {
    return parsed.pathname.startsWith('/livre/') ? 'paris-fiche' : 'paris-recherche'
  }

  if (hostnameMatches(parsed.hostname, LALIBRAIRIE_HOSTNAME)) {
    const pathname = parsed.pathname.startsWith('/index.php/')
      ? parsed.pathname.slice('/index.php'.length)
      : parsed.pathname
    return pathname.startsWith('/livres/') && pathname.endsWith('.html') ? 'lalibrairie-fiche' : 'autre'
  }

  return 'autre'
}

// Non exporté (inféré à l'appel, `planBuyLinksAutofill` est le seul point
// d'entrée consommé hors de ce fichier — `buy-links-autofill.ts`).
interface BuyLinksAutofillPlan {
  /** `null` si l'ISBN courant est absent/invalide — aucun besoin possible sans EAN. */
  ean13: string | null
  needParis: boolean
  needLalibrairie: boolean
}

/**
 * Décide, à la sauvegarde d'une fiche, quels champs libraires ont besoin
 * d'être (re)résolus depuis l'ISBN — consommé par le hook `beforeChange`
 * (`buy-links-autofill.ts`). Besoin si le champ est vide, OU si l'ISBN vient
 * de changer (compacts différents) ET que la valeur actuelle du champ
 * contient encore l'ancien EAN-13 (lien généré par un autofill précédent,
 * devenu obsolète) — un lien collé à la main sur une fiche qui n'avait pas
 * encore d'ISBN n'est jamais repris.
 */
export function planBuyLinksAutofill(input: {
  isbn: string | null | undefined
  previousIsbn: string | null | undefined
  parislibrairies: string | null | undefined
  lalibrairie: string | null | undefined
}): BuyLinksAutofillPlan {
  const ean13 = typeof input.isbn === 'string' ? isbn13FromIsbn(input.isbn) : null
  if (ean13 == null) {
    return { ean13: null, needParis: false, needLalibrairie: false }
  }

  const previousCompact = typeof input.previousIsbn === 'string' ? compactIsbn(input.previousIsbn) : ''
  const currentCompact = compactIsbn(input.isbn as string)
  const isbnChanged = previousCompact !== currentCompact
  const previousEan13 =
    isbnChanged && typeof input.previousIsbn === 'string' ? isbn13FromIsbn(input.previousIsbn) : null

  const needsField = (value: string | null | undefined): boolean => {
    if (classifyBuyLinkValue(value) === 'empty') return true
    return previousEan13 != null && typeof value === 'string' && value.includes(previousEan13)
  }

  return {
    ean13,
    needParis: needsField(input.parislibrairies),
    needLalibrairie: needsField(input.lalibrairie),
  }
}

// Non exportés (seule `BuyLinksBackfillPlan`, qui les compose, l'est) —
// `planBackfillForBook` est le seul point d'entrée consommé hors de ce
// fichier (`scripts/backfill-buy-links.ts`, `buy-links-core.test.ts`).
/** Action décidée pour un champ par `planBackfillForBook` — `swap` porte déjà la valeur, sans réseau. */
type BuyLinksFieldAction = { kind: 'none' } | { kind: 'resolve' } | { kind: 'swap'; value: string }

interface BuyLinksFieldPlan {
  classification: BuyLinkClassification
  action: BuyLinksFieldAction
}

export interface BuyLinksBackfillPlan {
  /** `null` si ISBN absent/invalide — compté « isbn invalide/absent » par le script, rien n'est résolvable. */
  ean13: string | null
  parislibrairies: BuyLinksFieldPlan
  lalibrairie: BuyLinksFieldPlan
}

/**
 * Cœur pur du plan de backfill (`scripts/backfill-buy-links.ts`) : pour une
 * fiche donnée, classification des deux champs puis décision — jamais de
 * réseau ici, `kind: 'resolve'` signale seulement au script qu'une
 * résolution est nécessaire (via `buy-links-resolve.ts`).
 *
 * Ordre des règles :
 * 1. Inversion — les deux champs portent chacun le type de fiche de l'autre
 *    (ex. une fiche ParisLibrairies collée dans `lalibrairie`, et
 *    inversement) : échange direct, sans réseau, AVANT toute autre règle
 *    (repérable même si l'ISBN est invalide — la classification suffit).
 * 2. Sans EAN valide : rien n'est résolvable, aucun champ touché.
 * 3. `paris-recherche` (legacy `listeliv.php`) ou `lalibrairie-fiche`
 *    résiduel (hors inversion) dans `parislibrairies`, `paris-fiche` résiduel
 *    dans `lalibrairie`, ou champ `empty` : à résoudre.
 * 4. Le reste (`autre`, fiche déjà correcte) : jamais touché — seulement
 *    signalé par le script via la classification retournée ici.
 */
export function planBackfillForBook(book: {
  isbn: string | null
  parislibrairies: string | null
  lalibrairie: string | null
}): BuyLinksBackfillPlan {
  const parisClass = classifyBuyLinkValue(book.parislibrairies)
  const lalibrairieClass = classifyBuyLinkValue(book.lalibrairie)
  const ean13 = book.isbn ? isbn13FromIsbn(book.isbn) : null

  if (parisClass === 'lalibrairie-fiche' && lalibrairieClass === 'paris-fiche') {
    return {
      ean13,
      parislibrairies: {
        classification: parisClass,
        action: { kind: 'swap', value: book.lalibrairie as string },
      },
      lalibrairie: {
        classification: lalibrairieClass,
        action: { kind: 'swap', value: book.parislibrairies as string },
      },
    }
  }

  const resolveParis =
    ean13 != null &&
    (parisClass === 'empty' || parisClass === 'paris-recherche' || parisClass === 'lalibrairie-fiche')
  const resolveLalibrairie = ean13 != null && (lalibrairieClass === 'empty' || lalibrairieClass === 'paris-fiche')

  return {
    ean13,
    parislibrairies: {
      classification: parisClass,
      action: resolveParis ? { kind: 'resolve' } : { kind: 'none' },
    },
    lalibrairie: {
      classification: lalibrairieClass,
      action: resolveLalibrairie ? { kind: 'resolve' } : { kind: 'none' },
    },
  }
}
