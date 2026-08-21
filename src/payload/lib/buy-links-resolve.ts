import {
  extractLalibrairieToken,
  isParisLibrairiesFicheUrl,
  LALIBRAIRIE_ORIGIN,
  normalizeLalibrairieFicheUrl,
  parisLibrairiesProbeUrl,
} from './buy-links-core.ts'

/**
 * Orchestration I/O de la résolution des liens libraires (cœur pur dans
 * `buy-links-core.ts` — classification/décision) : appelée par le hook
 * `beforeChange` (`buy-links-autofill.ts`, une fiche à la fois) et par
 * `scripts/backfill-buy-links.ts` (une session LaLibrairie partagée pour tout
 * le run).
 *
 * Fail-open partout : toute erreur réseau/timeout renvoie `null`, jamais de
 * throw — on n'écrit JAMAIS un lien non vérifié, et un site tiers en carafe
 * ne doit jamais faire échouer l'enregistrement d'une fiche (contrat mission,
 * repris par le hook appelant).
 */

const REQUEST_TIMEOUT_MS = 4000
// Cloudflare (ParisLibrairies) bloque les clients sans UA de navigateur —
// UA Chrome/macOS constant, vérifié empiriquement (mission).
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const LALIBRAIRIE_HOME_URL = `${LALIBRAIRIE_ORIGIN}/`
const LALIBRAIRIE_SEARCH_URL = `${LALIBRAIRIE_ORIGIN}/livres/recherche.html`

export interface LalibrairieSession {
  /** `Cookie:` prêt à l'emploi — concaténation des `Set-Cookie` de la page d'accueil. */
  cookie: string
  /** Jeton CSRF du formulaire de recherche rapide. */
  token: string
}

/**
 * Étape 1/3 de la résolution LaLibrairie (mission) : GET la page d'accueil,
 * récupère cookies + jeton CSRF. Session réutilisable pour plusieurs
 * recherches d'affilée (`scripts/backfill-buy-links.ts`).
 */
export async function createLalibrairieSession(): Promise<LalibrairieSession | null> {
  try {
    const response = await fetch(LALIBRAIRIE_HOME_URL, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const cookie = response.headers
      .getSetCookie()
      .map((raw) => raw.split(';')[0])
      .join('; ')
    const token = extractLalibrairieToken(await response.text())
    if (!cookie || !token) return null
    return { cookie, token }
  } catch {
    return null
  }
}

/**
 * Étapes 2/3 de la résolution LaLibrairie : POST la recherche rapide par
 * EAN, `redirect: 'manual'` — un 302 avec `Location` vers une fiche
 * `/livres/…_{ean13}.html` est le seul signal de succès (un 200 sans
 * redirection = livre absent, PAS une erreur HTTP).
 */
export async function resolveLalibrairieUrl(
  session: LalibrairieSession,
  ean13: string,
): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      'rapid-search': ean13,
      searchLang: 'fra',
      token: session.token,
    })
    const response = await fetch(LALIBRAIRIE_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: session.cookie,
        'User-Agent': BROWSER_USER_AGENT,
      },
      body: body.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status !== 302) return null
    const location = response.headers.get('location')
    if (!location) return null
    return normalizeLalibrairieFicheUrl(location, ean13)
  } catch {
    return null
  }
}

/**
 * Résolution ParisLibrairies : sonde `GET /livre/{ean13}`, `redirect:
 * 'follow'` — succès ssi la redirection aboutit (status 200) sur la fiche
 * canonique DE CET EAN (`isParisLibrairiesFicheUrl`) ; un EAN inconnu termine
 * en cascade sur une 404, jamais un 200 sur `/livre/{ean13}`.
 */
export async function resolveParisLibrairiesUrl(ean13: string): Promise<string | null> {
  try {
    const response = await fetch(parisLibrairiesProbeUrl(ean13), {
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status !== 200) return null
    return isParisLibrairiesFicheUrl(response.url, ean13) ? response.url : null
  } catch {
    return null
  }
}

export interface BuyLinksNeed {
  needParis: boolean
  needLalibrairie: boolean
}

export interface ResolvedBuyLinks {
  parislibrairies: string | null
  lalibrairie: string | null
}

/**
 * Résolution combinée d'un EAN — jamais plus de requêtes que nécessaire
 * (`need`, cf. `planBuyLinksAutofill`/`planBackfillForBook`) : ParisLibrairies
 * et LaLibrairie (session dédiée, éphémère) en parallèle, sans dépendance
 * entre les deux. C'est ce résolveur qui est injecté dans le hook Payload
 * (`makeAutofillBuyLinks(resolveBuyLinks)`, `Books.ts`) ; le script de
 * backfill appelle directement les fonctions unitaires ci-dessus pour
 * partager une session LaLibrairie sur tout le run.
 */
export async function resolveBuyLinks(ean13: string, need: BuyLinksNeed): Promise<ResolvedBuyLinks> {
  const [parislibrairies, lalibrairie] = await Promise.all([
    need.needParis ? resolveParisLibrairiesUrl(ean13) : Promise.resolve(null),
    need.needLalibrairie ? resolveLalibrairieFromScratch(ean13) : Promise.resolve(null),
  ])
  return { parislibrairies, lalibrairie }
}

async function resolveLalibrairieFromScratch(ean13: string): Promise<string | null> {
  const session = await createLalibrairieSession()
  if (!session) return null
  return resolveLalibrairieUrl(session, ean13)
}
