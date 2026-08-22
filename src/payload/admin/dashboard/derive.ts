import { isoDayParis } from '../../../lib/format.ts'
import { isPromoExpired } from '../../../lib/promo-core.ts'

/**
 * Cœur pur du tableau de bord `/admin` (refonte home : bandeau KPI →
 * graphique ventes → dernières commandes → bloc « En cours » → raccourcis,
 * aucun panneau de plus de 4 entrées) — dérivations sans I/O, testées dans
 * `derive.test.ts`. Les lectures Payload/Stripe/Sentry vivent dans `data.ts`,
 * le rendu dans `Dashboard.tsx` (vague 2 — pas encore réécrit à la date de ce
 * commit, cf. note plus bas), `../stock/StockPage.tsx` (`/admin/stock`),
 * `../health/HealthPage.tsx` (`/admin/sante`, admin) et `dashboard-classes.ts`.
 *
 * Principe non négociable du design : jamais de vert ni de zéro « par
 * défaut » — un signal non calculable est `na` (gris, « diagnostic
 * indisponible »), pas `ok`.
 *
 * Décision client actée : suppression TOTALE du système de retard des
 * commandes — plus de seuils 48/72 h, plus de pastille de retard, plus de
 * « provisoire ». Une commande de la file est juste une commande. Idem la
 * notion de mois civil pour le KPI ventes, remplacée par une fenêtre
 * glissante 30 j vs 30 j précédents (`rollingWindows`/`salesStats`) —
 * `parisMonthBounds` (plus bas) reste néanmoins en place : son seul usage
 * restant est le raccourci « Ventes du mois » de `Dashboard.tsx`, qui n'a pas
 * encore été réécrit par la vague 2 (fichier hors périmètre de cet agent).
 *
 * Ce fichier nourrit aussi le futur détail `/admin/ventes` (KPIs
 * multi-fenêtres, seaux mensuels, top titres) : `windowSalesStats`
 * (généralisation de `salesStats` à une largeur de fenêtre paramétrable),
 * `monthlySalesBuckets`/`monthlyBucketToChartInput` et `topTitles`, sur la
 * lecture ~13 mois `readSalesHistory` (`data.ts`) — distincte de
 * `readSalesWindow` (60 j, home). Rendu et endpoint I/O hors périmètre de cet
 * agent (vue pas encore écrite à la date de ce commit).
 */

/** État d'un signal/panneau — `na` = non calculable (gris), jamais converti en vert. */
export type PanelState = 'ok' | 'warn' | 'alert' | 'na'

/** Pire état d'un ensemble d'états (pour un signal de panneau composite). */
export function worstState(states: PanelState[]): PanelState {
  if (states.includes('alert')) return 'alert'
  if (states.includes('warn')) return 'warn'
  if (states.includes('na')) return 'na'
  return 'ok'
}

const DAY_MS = 86_400_000

/* ────────────────────────── Stock bas (3.3) ────────────────────────── */

/** Défaut du seuil quand `reglages-boutique` est illisible (affiché explicitement dans l'UI). */
export const STOCK_SEUIL_FALLBACK = 3

/** État d'une ligne : 0 = épuisé (« indisponible en ligne »), sinon stock bas. */
export function stockRowState(stock: number): Extract<PanelState, 'warn' | 'alert'> {
  return stock <= 0 ? 'alert' : 'warn'
}

/** Signal du panneau stock : un titre à 0 → alerte ; sous le seuil → attention ; sinon OK. */
export function stockSignal(stocks: number[]): PanelState {
  if (stocks.some((s) => s <= 0)) return 'alert'
  if (stocks.length > 0) return 'warn'
  return 'ok'
}

/* ────────────────────────── Ventes — KPI 30 j + graphique ────────────────────────── */

/**
 * Bornes de la fenêtre glissante 30 j vs 30 j précédents (KPI ventes) —
 * arithmétique ms simple, PAS de notion de jour civil/fuseau (contrairement à
 * `parisMonthBounds` : une fenêtre glissante n'a pas de bord de mois, juste un
 * intervalle de durée fixe).
 */
export function rollingWindows(now: Date): { start30: Date; start60: Date } {
  return {
    start30: new Date(now.getTime() - 30 * DAY_MS),
    start60: new Date(now.getTime() - 60 * DAY_MS),
  }
}

/**
 * Forme neutre d'une commande vendue (paid/prepared/shipped), telle que
 * lue par `readSalesWindow` — nourrit `salesStats`, `dailySalesBuckets`,
 * `quantitySoldByBook` et `precommandeQuantityByBook`, UNE seule lecture pour
 * ces quatre dérivations.
 */
export interface SalesWindowRow {
  paidAt: string | null
  createdAt: string
  totalTTC: number
  orderType: string
  lines: { quantity: number; book: number | null }[]
}

export interface SalesStats {
  ca: number
  nbCommandes: number
  nbExemplaires: number
  caPrecommande: number
  /** `null` si la fenêtre précédente est à 0 — jamais une division par zéro/`Infinity`. */
  deltaPct: number | null
}

/**
 * Forme minimale qu'exige `windowSalesStats` — satisfaite à la fois par
 * `SalesWindowRow` (lignes `{quantity, book}`, `readSalesWindow` 60 j) et par
 * `SalesHistoryRow` (lignes `{quantity, titleSnapshot, unitPriceTTC}`,
 * `readSalesHistory` 13 mois) : seule la quantité par ligne compte ici, le
 * typage structurel de TypeScript accepte les deux sans conversion.
 */
interface WindowStatsRow {
  paidAt: string | null
  createdAt: string
  totalTTC: number
  orderType: string
  lines: { quantity: number }[]
}

/**
 * Statistiques de ventes en fenêtre glissante de `days` jours vs `days` jours
 * précédents — généralisation de l'ancien corps de `salesStats` (désormais un
 * simple appel `windowSalesStats(rows, 30, now)`, cf. plus bas) à une largeur
 * de fenêtre paramétrable (KPIs multi-fenêtres de la future page
 * `/admin/ventes` : 7/30/90 j…). Étanchéité comptable DURE dons/ventes
 * (CLAUDE.md racine, `orderType: "don"` jamais dans un agrégat de CA/TVA) :
 * un don est écarté ICI, pas seulement dans le `where` du lecteur I/O — la
 * garantie tient même si un autre appelant réutilise cette fonction sur des
 * lignes non pré-filtrées. Fenêtre courante = `paidAt ?? createdAt` ∈
 * [now-days, now] ; précédente = [now-2×days, now-days[ (borne haute
 * exclusive — un ordre pile à la borne ne compte qu'une fois, dans la fenêtre
 * courante). `deltaPct` à `null` si la fenêtre précédente est à 0 (jamais une
 * division par zéro/`Infinity`).
 */
export function windowSalesStats<T extends WindowStatsRow>(rows: T[], days: number, now: Date): SalesStats {
  const start = new Date(now.getTime() - days * DAY_MS)
  const startPrev = new Date(now.getTime() - 2 * days * DAY_MS)
  const tStart = start.getTime()
  const tPrev = startPrev.getTime()
  const tNow = now.getTime()

  let ca = 0
  let nbCommandes = 0
  let nbExemplaires = 0
  let caPrecommande = 0
  let caPrev = 0

  for (const row of rows) {
    if (row.orderType === 'don') continue
    const at = Date.parse(row.paidAt ?? row.createdAt)
    if (Number.isNaN(at)) continue
    if (at >= tStart && at <= tNow) {
      ca += row.totalTTC
      nbCommandes += 1
      nbExemplaires += row.lines.reduce((sum, l) => sum + l.quantity, 0)
      if (row.orderType === 'precommande') caPrecommande += row.totalTTC
    } else if (at >= tPrev && at < tStart) {
      caPrev += row.totalTTC
    }
  }

  const deltaPct = caPrev === 0 ? null : ((ca - caPrev) / caPrev) * 100
  return { ca, nbCommandes, nbExemplaires, caPrecommande, deltaPct }
}

/**
 * Statistiques de ventes en fenêtre glissante 30 j vs 30 j précédents (bandeau
 * KPI) — délègue à `windowSalesStats` avec `days=30` (mêmes bornes que
 * `rollingWindows`, résultats identiques à l'implémentation historique).
 */
export function salesStats(rows: SalesWindowRow[], now: Date): SalesStats {
  return windowSalesStats(rows, 30, now)
}

export interface DailySalesBucket {
  day: string
  ca: number
}

/**
 * 30 seaux quotidiens (jour CIVIL PARIS, `isoDayParis`) pour le graphique
 * ventes — série complète et ordonnée du plus ancien au plus récent (dernier
 * seau = jour de `now`), jours sans vente à 0 (jamais un trou). Même
 * étanchéité dons/ventes que `salesStats`.
 */
export function dailySalesBuckets<T extends WindowStatsRow>(rows: T[], now: Date): DailySalesBucket[] {
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const day = isoDayParis(new Date(now.getTime() - i * DAY_MS))
    if (day) days.push(day)
  }
  const byDay = new Map(days.map((day) => [day, 0]))

  for (const row of rows) {
    if (row.orderType === 'don') continue
    const day = isoDayParis(row.paidAt ?? row.createdAt)
    if (day && byDay.has(day)) {
      byDay.set(day, (byDay.get(day) ?? 0) + row.totalTTC)
    }
  }

  return days.map((day) => ({ day, ca: byDay.get(day) ?? 0 }))
}

export interface SalesChartBar {
  x: number
  y: number
  w: number
  h: number
  day: string
  ca: number
}

/**
 * Géométrie des barres du graphique ventes — largeur égale par seau, hauteur
 * proportionnelle au maximum de la série (le maximum touche `height` pleine).
 * Seaux tous à 0 → barres de hauteur 0 (jamais de division par zéro/`NaN`) ;
 * série vide → aucune barre.
 */
export function salesChartGeometry(
  buckets: DailySalesBucket[],
  dims: { width: number; height: number },
): SalesChartBar[] {
  const { width, height } = dims
  const n = buckets.length
  if (n === 0) return []
  const w = width / n
  const max = Math.max(0, ...buckets.map((b) => b.ca))

  return buckets.map((b, i) => {
    const h = max > 0 ? (b.ca / max) * height : 0
    return { x: i * w, y: height - h, w, h, day: b.day, ca: b.ca }
  })
}

/* ────────────────────────── Ventes — historique 13 mois (page /admin/ventes) ────────────────────────── */

/**
 * Ligne d'une commande vendue telle que lue par `readSalesHistory`
 * (`data.ts`, fenêtre ~13 mois civils Paris) — nourrit `windowSalesStats`
 * (KPIs multi-fenêtres), `monthlySalesBuckets` (seaux mensuels) et
 * `topTitles` (top titres) de la future page `/admin/ventes`. Distincte de
 * `SalesWindowRow` (fenêtre 60 j de la home, lignes `{quantity, book}`) : ici
 * chaque ligne porte son `titleSnapshot`/`unitPriceTTC`, nécessaires à
 * `topTitles` (agrégation par titre, CA par ligne) — pas d'identifiant
 * `book`, cette lecture ne nourrit aucune dérivation par livre.
 */
export interface SalesHistoryLine {
  quantity: number
  titleSnapshot: string
  unitPriceTTC: number
}

export interface SalesHistoryRow {
  paidAt: string | null
  createdAt: string
  totalTTC: number
  orderType: string
  lines: SalesHistoryLine[]
}

export interface MonthlySalesBucket {
  /** `AAAA-MM` — clé stable, triable lexicographiquement. */
  month: string
  /** « août 2026 » — libellé humain, mois civil Paris. */
  label: string
  ca: number
  nbCommandes: number
}

/**
 * Seaux mensuels (mois CIVIL PARIS) pour la page `/admin/ventes` — série
 * complète et ordonnée du plus ancien au plus récent, `months` seaux (mois
 * courant inclus, forcément partiel), mois sans vente à 0 (jamais un trou).
 * Même étanchéité comptable dons/ventes que `salesStats`/`dailySalesBuckets`
 * (un don n'alimente ni `ca` ni `nbCommandes`). Le mois d'un timestamp est
 * dérivé via `parisYearMonth` (Intl `Europe/Paris`), jamais un `slice(0, 7)`
 * sur l'ISO UTC — un ordre passé après 22h/23h UTC (soir Paris) glisserait
 * sinon sur le mois précédent, faux pour les 5-6 derniers jours de chaque
 * mois selon la saison DST.
 */
export function monthlySalesBuckets(rows: SalesHistoryRow[], now: Date, months = 13): MonthlySalesBucket[] {
  const { year: nowYear, month: nowMonth } = parisYearMonth(now)
  const monthKeys: { year: number; month: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    monthKeys.push(shiftYearMonth(nowYear, nowMonth, -i))
  }

  const keyOf = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`
  const byMonth = new Map(monthKeys.map(({ year, month }) => [keyOf(year, month), { ca: 0, nbCommandes: 0 }]))

  for (const row of rows) {
    if (row.orderType === 'don') continue
    const at = new Date(row.paidAt ?? row.createdAt)
    if (Number.isNaN(at.getTime())) continue
    const { year, month } = parisYearMonth(at)
    const bucket = byMonth.get(keyOf(year, month))
    if (!bucket) continue // hors fenêtre (n'arrive pas si `rows` vient de `readSalesHistory`)
    bucket.ca += row.totalTTC
    bucket.nbCommandes += 1
  }

  const labelFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' })
  return monthKeys.map(({ year, month }) => {
    const key = keyOf(year, month)
    const bucket = byMonth.get(key)!
    return { month: key, label: labelFmt.format(parisMonthStartUtc(year, month)), ca: bucket.ca, nbCommandes: bucket.nbCommandes }
  })
}

/**
 * Adapte un seau mensuel à la forme générique `{day, ca}` qu'attend
 * `salesChartGeometry` — plutôt que de dupliquer la géométrie des barres pour
 * une série mensuelle, on réutilise la fonction existante TELLE QUELLE
 * (`day` porte alors la clé `AAAA-MM`, un simple libellé de seau pour cette
 * fonction générique, pas nécessairement un jour).
 */
export function monthlyBucketToChartInput(bucket: MonthlySalesBucket): DailySalesBucket {
  return { day: bucket.month, ca: bucket.ca }
}

export interface TopTitleRow {
  title: string
  exemplaires: number
  ca: number
}

/**
 * Top titres vendus sur une fenêtre glissante de `days` jours (page
 * `/admin/ventes`) — agrégation des lignes par `titleSnapshot` (clé
 * Woo-safe : un produit disparu du catalogue partage la fiche de repli
 * `archive-boutique-woo`, mais conserve son vrai titre en snapshot, donc reste
 * distinct des autres titres archivés dans ce top). `ca` = Σ quantity ×
 * unitPriceTTC (euros), arrondi au centime (évite le bruit de l'arithmétique
 * flottante, ex. 3 × 9,99 = 29,970000000000002). Tri exemplaires décroissant
 * puis CA décroissant (départage), tronqué à `max`. Dons EXCLUS : vue
 * « vendus », une contrepartie de don a un prix de ligne à 0 € qui
 * fausserait le CA par titre sans rien apporter au classement par
 * exemplaires. `now` explicite (et non un défaut interne) pour rester une
 * fonction pure testable, comme le reste de ce fichier.
 */
export function topTitles(
  rows: SalesHistoryRow[],
  now: Date,
  { days, max }: { days: number; max: number },
): TopTitleRow[] {
  const start = now.getTime() - days * DAY_MS
  const tNow = now.getTime()
  const byTitle = new Map<string, { exemplaires: number; ca: number }>()

  for (const row of rows) {
    if (row.orderType === 'don') continue
    const at = Date.parse(row.paidAt ?? row.createdAt)
    if (Number.isNaN(at) || at < start || at > tNow) continue
    for (const line of row.lines) {
      const entry = byTitle.get(line.titleSnapshot) ?? { exemplaires: 0, ca: 0 }
      entry.exemplaires += line.quantity
      entry.ca += line.quantity * line.unitPriceTTC
      byTitle.set(line.titleSnapshot, entry)
    }
  }

  return [...byTitle.entries()]
    .map(([title, { exemplaires, ca }]) => ({ title, exemplaires, ca: Math.round(ca * 100) / 100 }))
    .sort((a, b) => b.exemplaires - a.exemplaires || b.ca - a.ca)
    .slice(0, max)
}

/* ────────────────────────── Vélocité stock (précommandes + rupture) ────────────────────────── */

/**
 * Somme des quantités vendues par livre, dans la fenêtre glissante 30 j —
 * réducteur commun à `quantitySoldByBook` (vélocité stock) et
 * `precommandeQuantityByBook` (précommandes payées par titre), tous deux sur
 * les lignes de `readSalesWindow` (pas de requête supplémentaire).
 */
function sumQuantityByBookInWindow(
  rows: SalesWindowRow[],
  now: Date,
  keep: (orderType: string) => boolean,
): Map<number, number> {
  const { start30 } = rollingWindows(now)
  const t30 = start30.getTime()
  const tNow = now.getTime()
  const result = new Map<number, number>()

  for (const row of rows) {
    if (!keep(row.orderType)) continue
    const at = Date.parse(row.paidAt ?? row.createdAt)
    if (Number.isNaN(at) || at < t30 || at > tNow) continue
    for (const line of row.lines) {
      if (line.book === null) continue
      result.set(line.book, (result.get(line.book) ?? 0) + line.quantity)
    }
  }
  return result
}

/**
 * Quantités vendues (30 j) par livre — nourrit `stockOutlook` (vélocité).
 * Compte TOUTES les commandes de la fenêtre, dons compris : un exemplaire
 * donné en contrepartie quitte le stock comme un exemplaire vendu. Ce n'est
 * PAS un agrégat de CA — l'étanchéité comptable dons/ventes de `salesStats`
 * ne s'applique qu'aux agrégats financiers, pas au décompte physique du
 * stock.
 */
export function quantitySoldByBook(rows: SalesWindowRow[], now: Date): Map<number, number> {
  return sumQuantityByBookInWindow(rows, now, () => true)
}

/**
 * Précommandes payées (30 j) par livre — pour le bloc « En cours » (nombre de
 * précommandes reçues par titre à paraître). Fenêtre glissante 30 j, PAS le
 * total vie entière d'une campagne de précommande ouverte plus tôt : même
 * lecture unique `readSalesWindow` que le reste du dashboard (décision
 * documentée dans `data.ts:readUpcomingBooks`), pas de requête dédiée.
 */
export function precommandeQuantityByBook(rows: SalesWindowRow[], now: Date): Map<number, number> {
  return sumQuantityByBookInWindow(rows, now, (t) => t === 'precommande')
}

export interface StockOutlookInput {
  id: number
  title: string
  edition: string | null
  stock: number | null
  stockSuivi: string | null
}

export interface StockOutlookRow {
  id: number
  title: string
  edition: string | null
  stock: number | null
  stockSuivi: string | null
  vendus30j: number
  velociteJour: number
  joursRestants: number | null
  rupturePrevue: string | null
}

/**
 * Projection de rupture par titre. `joursRestants`/`rupturePrevue` à `null`
 * si le stock n'est pas suivi (`null`, "vide = pas de décompte") OU si la
 * vélocité est nulle (jamais une division par zéro déguisée en "infini jours
 * restants"). `joursRestants` arrondi à l'entier inférieur — un stock qui
 * suffit encore 4,9 jours affiche 4, pas 5.
 */
export function stockOutlook(
  books: StockOutlookInput[],
  soldByBook: Map<number, number>,
  now: Date,
): StockOutlookRow[] {
  return books.map((book) => {
    const vendus30j = soldByBook.get(book.id) ?? 0
    const velociteJour = vendus30j / 30
    let joursRestants: number | null = null
    let rupturePrevue: string | null = null
    if (book.stock !== null && vendus30j > 0) {
      joursRestants = Math.floor(book.stock / velociteJour)
      rupturePrevue = isoDayParis(new Date(now.getTime() + joursRestants * DAY_MS))
    }
    return {
      id: book.id,
      title: book.title,
      edition: book.edition,
      stock: book.stock,
      stockSuivi: book.stockSuivi,
      vendus30j,
      velociteJour,
      joursRestants,
      rupturePrevue,
    }
  })
}

/**
 * Sous-ensemble « urgent » du stock (ce que la home affiche, cap 4 côté
 * rendu) : épuisés (stock ≤ 0, vendable — un stock `null` n'est jamais
 * requalifié en épuisé) d'abord, puis rupture prévue la plus proche. Un livre
 * au stock non suivi (`null`) ou à vélocité nulle n'a pas de signal d'urgence
 * calculable et n'apparaît pas ici, plutôt que d'être classé arbitrairement.
 */
export function urgentStockRows(outlook: StockOutlookRow[], seuilJours = 30): StockOutlookRow[] {
  const isOut = (row: StockOutlookRow) => row.stock !== null && row.stock <= 0
  const urgent = outlook.filter(
    (row) => isOut(row) || (row.joursRestants !== null && row.joursRestants <= seuilJours),
  )
  return [...urgent].sort((a, b) => {
    const aOut = isOut(a)
    const bOut = isOut(b)
    if (aOut !== bOut) return aOut ? -1 : 1
    const aJours = a.joursRestants ?? Infinity
    const bJours = b.joursRestants ?? Infinity
    return aJours - bJours
  })
}

export interface DatedQuantity {
  date: string
  quantity: number
}

/**
 * Quantités par semaine glissante (mini-barres sparkline, page stock) —
 * `weeks` seaux de 7 jours, le plus récent se terminant à `now`, du plus
 * ancien au plus récent. Générique (indépendant d'un livre) : l'appelant
 * pré-filtre les lignes par titre/livre avant d'agréger. Une date future ou
 * illisible est ignorée (jamais une erreur, jamais un seau négatif).
 */
export function bucketWeeklyQuantities(rows: DatedQuantity[], now: Date, weeks = 8): number[] {
  const buckets = new Array<number>(weeks).fill(0)
  const nowMs = now.getTime()

  for (const row of rows) {
    const at = Date.parse(row.date)
    if (Number.isNaN(at)) continue
    const ageMs = nowMs - at
    if (ageMs < 0) continue
    const weekIndexFromEnd = Math.floor(ageMs / (7 * DAY_MS))
    if (weekIndexFromEnd >= weeks) continue
    buckets[weeks - 1 - weekIndexFromEnd] += row.quantity
  }
  return buckets
}

/* ────────────────────────── Résumés (file de travail / bloc « En cours ») ────────────────────────── */

/**
 * Âge relatif humain, français, sans librairie — « à l'instant » (strictement
 * moins de 60 s), puis minutes/heures/jours (troncature entière). Une date
 * illisible ou future dégrade en « à l'instant »/tiret plutôt que de planter.
 */
export function humanAge(iso: string, now: Date): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return '—'
  const seconds = Math.floor((now.getTime() - at) / 1000)
  if (seconds < 60) return 'à l’instant'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}

export interface SummarizableLine {
  titleSnapshot: string
  quantity: number
}

/**
 * Résumé compact des lignes d'une commande — « 2× Titre A + 1× Titre B + 2
 * autres ». Le « + N autres » compte les LIGNES au-delà de `max`, pas les
 * exemplaires (une ligne à quantité 5 au-delà de `max` compte pour 1, pas 5).
 */
export function summarizeLines(lines: SummarizableLine[], max = 3): string {
  if (lines.length === 0) return ''
  const shown = lines.slice(0, max)
  const rest = lines.length - shown.length
  const parts = shown.map((l) => `${l.quantity}× ${l.titleSnapshot}`)
  if (rest > 0) parts.push(`${rest} autre${rest > 1 ? 's' : ''}`)
  return parts.join(' + ')
}

/* ────────────────────────── Raccourci « Ventes du mois » (zone C) ────────────────────────── */

/**
 * Bornes UTC du mois civil courant **à l'heure de Paris** (les `paidAt` sont
 * stockés en UTC). Un 1ᵉʳ du mois n'est jamais dans la fenêtre de changement
 * d'heure (dernier dimanche de mars/octobre) : le décalage d'un début de mois
 * est donc déterministe — avril→octobre : UTC+2 (CEST), novembre→mars : UTC+1.
 * Ne sert plus au KPI (fenêtre glissante 30 j, `rollingWindows`) — seul usage
 * restant : le lien « Ventes du mois » de `Dashboard.tsx` (raccourci zone C,
 * pas encore réécrit par la vague 2).
 */
export function parisMonthBounds(now: Date): { start: Date; end: Date; label: string } {
  const { year, month } = parisYearMonth(now)
  const startUtc = parisMonthStartUtc(year, month)
  const endUtc = month === 12 ? parisMonthStartUtc(year + 1, 1) : parisMonthStartUtc(year, month + 1)
  const label = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    month: 'long',
    year: 'numeric',
  }).format(startUtc)
  return { start: startUtc, end: endUtc, label }
}

/**
 * Année/mois civil (1-12) **à l'heure de Paris** d'un instant — le seul point
 * de passage pour dériver un mois civil d'un timestamp dans ce fichier
 * (`parisMonthBounds`, `monthlySalesBuckets`, `monthsAgoParisMonthStartUtc`) :
 * jamais un `slice(0, 7)` sur l'ISO UTC, qui glisserait sur le mois précédent
 * pour tout instant tombé après 22h/23h UTC (soir Paris déjà dans le mois
 * suivant).
 */
function parisYearMonth(instant: Date): { year: number; month: number } {
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: 'numeric',
  })
  const parts = fmt.formatToParts(instant)
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value), // 1-12
  }
}

/** Minuit Paris du 1ᵉʳ du mois (1-12), en UTC. */
function parisMonthStartUtc(year: number, month: number): Date {
  const offsetHours = month >= 4 && month <= 10 ? 2 : 1
  return new Date(Date.UTC(year, month - 1, 1, -offsetHours))
}

/**
 * Décale un couple année/mois civil (1-12) de `delta` mois (négatif = en
 * arrière) — arithmétique entière sur un total de mois depuis l'an 0, modulo
 * toujours ramené en `[1, 12]` (le double `% 12` garde le résultat positif
 * même pour un `delta` négatif qui ferait chuter `total` sous 0).
 */
function shiftYearMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 }
}

/**
 * Instant UTC (minuit civil Paris) du 1ᵉʳ jour du mois situé `monthsBack` mois
 * avant le mois civil Paris de `now` — borne basse partagée par
 * `readSalesHistory` (`data.ts`, fenêtre I/O ~13 mois) et `monthlySalesBuckets`
 * (série de seaux) : la lecture Postgres et l'agrégation portent ainsi
 * exactement sur la même fenêtre, sans dupliquer l'arithmétique de mois.
 */
export function monthsAgoParisMonthStartUtc(now: Date, monthsBack: number): Date {
  const { year, month } = parisYearMonth(now)
  const target = shiftYearMonth(year, month, -monthsBack)
  return parisMonthStartUtc(target.year, target.month)
}

/* ────────────────────────── Export CSV (bornes de dates) ────────────────────────── */

/** Date civile Paris au format `AAAA-MM-JJ` (valeur d'un `<input type="date">`). */
export function parisDateYmd(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Plage d'export par défaut : `to` = aujourd'hui (Paris), `from` = même jour
 * un mois civil plus tôt (jour calé si le mois cible est plus court).
 */
export function defaultExportDateRange(now: Date): { from: string; to: string } {
  const to = parisDateYmd(now)
  const [y, m, d] = to.split('-').map(Number)
  let year = y
  let month = m - 1
  if (month < 1) {
    month = 12
    year -= 1
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(d, daysInMonth)
  const from = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { from, to }
}

/* ────────────────────────── Import routeur (3.7) ────────────────────────── */

/**
 * Seuil d'alerte de fraîcheur de l'import mensuel — PROPOSITION non actée par
 * le client (design v2 §3.7), affichée comme provisoire dans l'UI.
 */
export const IMPORT_ALERT_DAYS = 35

/**
 * Signal de fraîcheur : aucun import enregistré → gris (pas un rouge
 * alarmiste au lancement) ; dernier import > 35 j → alerte ; sinon OK.
 */
export function importSignal(lastRunAt: string | null, now: Date): PanelState {
  if (!lastRunAt) return 'na'
  const at = Date.parse(lastRunAt)
  if (Number.isNaN(at)) return 'na'
  return (now.getTime() - at) / DAY_MS > IMPORT_ALERT_DAYS ? 'alert' : 'ok'
}

/* ────────────────────────── Codes promo (3.11) ────────────────────────── */

/**
 * Répartit les codes encore `active` en deux lots — `live` (valides) et
 * `expiredActive` (`expiresAt` dépassé, JOUR INCLUSIF : un code qui expire le
 * 13/07 reste valable toute la journée du 13/07, décision produit 17/07),
 * candidats au « désactiver en un clic ». `expiresAt` absent = jamais expiré,
 * donc toujours `live`. Remplace l'ancien `expiredActivePromos` (même
 * prédicat `isPromoExpired`, désormais réellement partagé — et non plus
 * seulement affirmé en commentaire — avec l'évaluation panier de
 * `promo-core.ts:evaluatePromoCode`, checkout ↔ dashboard alignés).
 */
export function splitPromos<T extends { active?: boolean | null; expiresAt?: string | null }>(
  promos: T[],
  now: Date,
): { live: T[]; expiredActive: T[] } {
  const live: T[] = []
  const expiredActive: T[] = []
  for (const promo of promos) {
    if (promo.active !== true) continue
    if (isPromoExpired(promo.expiresAt, now)) {
      expiredActive.push(promo)
    } else {
      live.push(promo)
    }
  }
  return { live, expiredActive }
}

/* ────────────────────────── Observabilité (3.12) ────────────────────────── */

/**
 * Décompte des événements d'erreur sur les issues Sentry non résolues (24 h).
 * `count` arrive en chaîne dans l'API Sentry.
 */
export function sentryErrorEvents(issues: { level?: string; count?: string | number }[]): number {
  return issues
    .filter((i) => i.level === 'error' || i.level === 'fatal')
    .reduce((sum, i) => sum + (Number(i.count) || 0), 0)
}

/** Alerte si au moins un événement `error`/`fatal` en 24 h (design v2 §3.12). */
export function sentrySignal(errorEvents: number | null): PanelState {
  if (errorEvents === null) return 'na'
  return errorEvents > 0 ? 'alert' : 'ok'
}

/* ────────────────────────── Bandeau d'état (3.1) ────────────────────────── */

export interface BannerItem {
  /** Identifiant stable du signal (ancre `#panneau-…`). */
  key: 'commandes' | 'stock' | 'import'
  label: string
  state: PanelState
  /**
   * Ancre vers le panneau correspondant — `null` si le lecteur n'a pas accès
   * au panneau (rôle) OU si le panneau ne sera pas rendu (zone B « Alertes »
   * conditionnelle, design v3 §23) : jamais un lien mort.
   */
  anchor: string | null
}

/**
 * Le bandeau n'existe que s'il a quelque chose à dire : masqué intégralement
 * quand TOUTES les pastilles sont vertes (design v2 §3.1, repris v3) — un
 * gris (signal non calculable) le maintient visible, jamais requalifié en
 * vert.
 */
export function bannerHidden(items: BannerItem[]): boolean {
  return items.every((item) => item.state === 'ok')
}

/** Libellé de pastille, vocabulaire éditeur (jamais de nom d'outil dans le bandeau partagé). */
export function pastilleText(item: BannerItem): string {
  const suffix: Record<PanelState, string> = {
    ok: 'OK',
    warn: 'à vérifier',
    alert: 'en alerte',
    na: 'indisponible',
  }
  if (item.key === 'import' && item.state === 'na') return `${item.label} : aucun import enregistré`
  return `${item.label} : ${suffix[item.state]}`
}

/* ────────────────────────── Formatage ────────────────────────── */

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

/** Montant en euros, format français (les commandes stockent des euros, pas des centimes). */
export function fmtEuros(amount: number): string {
  return EUR.format(amount)
}

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

const DATE_ONLY = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** « 9 juillet, 14:02 » (heure de Paris). */
export function fmtDateTimeFr(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '—' : DATE_TIME.format(t)
}

/** « 3 juillet 2026 » (heure de Paris). */
export function fmtDateFr(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '—' : DATE_ONLY.format(t)
}

/** Tag de maison affiché dans les tableaux (ES / LD / boutique seule). */
export function editionTag(edition: string | null | undefined): string {
  if (edition === 'editions-sociales') return 'ES'
  if (edition === 'la-dispute') return 'LD'
  return 'BOUT.'
}
