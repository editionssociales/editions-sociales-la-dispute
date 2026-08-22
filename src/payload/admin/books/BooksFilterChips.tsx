'use client'

import { useSearchParams } from 'next/navigation'

import styles from './books-filter-chips.module.css'

/**
 * Chips de filtre de la liste Livres (`/admin/collections/books`, issue
 * #26) — 2 groupes combinables :
 *
 * - **État** (exclusif entre chips d'état) : Tous | Brouillons | À paraître |
 *   Sans couverture | Stock bas (`commerce.sellable=true` ET `commerce.stock`
 *   existant ET `commerce.stock <= seuil` ET déjà paru — clauses héritées de
 *   l'ex-`readLowStock`, supprimé avec la V2 « Évolution du stock »,
 *   désormais énoncées ici).
 * - **Maison** (exclusif entre chips de maison) : ES | La Dispute.
 *
 * « À paraître » n'est PAS un champ mais une conséquence de `dateParution`
 * (décision client 2026-08-21, ex-checkbox `aParaitre` supprimée) : la borne
 * `borne` vient du serveur (`upcomingBoundaryUtc`, `sellability.ts`, via
 * `BooksFilterChipsPanel.tsx` — même motif que les chips `rencontres`) —
 * à paraître ⇔ `dateParution >= borne`, paru ⇔ `< borne`. Seule
 * simplification vs la clause serveur de `readStockOutlook`
 * (`dashboard/data.ts`) : son « OU sans date » (brouillon en cours de
 * saisie, compté paru) est inexprimable dans une liste plate de conditions
 * `and` — une telle fiche échappe à la chip « Stock bas » mais pas aux vues
 * stock dérivées de `readStockOutlook`.
 *
 * Règle de combinaison (issue #26) : une chip d'état + une chip de maison
 * peuvent être actives ensemble (toutes les conditions des deux groupes sont
 * combinées en ET) ; cliquer une chip du même groupe REMPLACE la sélection
 * de ce groupe (jamais un cumul de deux états ou deux maisons) ; recliquer
 * une chip maison déjà active la désactive (bascule) ; « Tous » remet à
 * zéro le groupe état SANS toucher à la maison sélectionnée.
 *
 * Chaque chip mène à un `where[or][0][and][j][champ][op]=valeur` complet
 * (convention du dépôt, cf. `Dashboard.tsx`) reconstruit de zéro à chaque clic
 * — la page repart donc toujours de 1 (aucun `page=…` reporté).
 *
 * Détection de la chip active : ces hrefs sont un ensemble FERMÉ de
 * combinaisons connues (pas un filtre arbitraire) — on cherche simplement,
 * dans la query string courante, la sous-chaîne `[champ][op]=valeur` propre
 * à chaque filtre (stable : l'index numérique `and][j]` varie selon les
 * combinaisons, mais précède toujours `[champ]`, jamais ne s'y intercale).
 */

interface BooksFilterChipsProps {
  seuil: number
  /** Borne « à paraître » (instant ISO, `upcomingBoundaryUtc`) — calculée côté serveur à la requête. */
  borne: string
}

type EtatChip = 'tous' | 'brouillons' | 'a-paraitre' | 'sans-couverture' | 'stock-bas'
type MaisonChip = 'es' | 'la-dispute'

interface WhereCondition {
  field: string
  op: string
  value: string
}

const MAISON_CONDITIONS: Record<MaisonChip, WhereCondition> = {
  es: { field: 'edition', op: 'equals', value: 'editions-sociales' },
  'la-dispute': { field: 'edition', op: 'equals', value: 'la-dispute' },
}

const ETAT_CHIPS: { key: EtatChip; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'brouillons', label: 'Brouillons' },
  { key: 'a-paraitre', label: 'À paraître' },
  { key: 'sans-couverture', label: 'Sans couverture' },
  { key: 'stock-bas', label: 'Stock bas' },
]

const MAISON_CHIPS: { key: MaisonChip; label: string }[] = [
  { key: 'es', label: 'Éditions sociales' },
  { key: 'la-dispute', label: 'La Dispute' },
]

/** Conditions `where` d'une chip d'état — `[]` pour « Tous » (rien à filtrer). */
function etatConditions(etat: EtatChip, seuil: number, borne: string): WhereCondition[] {
  switch (etat) {
    case 'brouillons':
      return [{ field: '_status', op: 'equals', value: 'draft' }]
    case 'a-paraitre':
      return [{ field: 'dateParution', op: 'greater_than_equal', value: borne }]
    case 'sans-couverture':
      return [{ field: 'cover', op: 'exists', value: 'false' }]
    case 'stock-bas':
      return [
        { field: 'commerce.sellable', op: 'equals', value: 'true' },
        { field: 'commerce.stock', op: 'exists', value: 'true' },
        { field: 'commerce.stock', op: 'less_than_equal', value: String(seuil) },
        { field: 'dateParution', op: 'less_than', value: borne },
      ]
    case 'tous':
    default:
      return []
  }
}

/** Href de la liste Livres pour une combinaison (état, maison) — repart toujours de la page 1. */
function buildHref(etat: EtatChip, maison: MaisonChip | null, seuil: number, borne: string): string {
  const conditions = etatConditions(etat, seuil, borne)
  if (maison) conditions.push(MAISON_CONDITIONS[maison])
  if (conditions.length === 0) return '/admin/collections/books'
  const query = conditions
    .map(
      (cond, index) =>
        `where[or][0][and][${index}][${cond.field}][${cond.op}]=${encodeURIComponent(cond.value)}`,
    )
    .join('&')
  return `/admin/collections/books?${query}`
}

function activeEtat(search: string): EtatChip {
  if (search.includes('[_status][equals]=draft')) return 'brouillons'
  // Matche aussi le lien « voir tous » du bloc « Prochaines parutions » du
  // dashboard (même clause) — la chip s'allume à l'arrivée.
  if (search.includes('[dateParution][greater_than_equal]=')) return 'a-paraitre'
  if (search.includes('[cover][exists]=false')) return 'sans-couverture'
  if (search.includes('[commerce.stock][less_than_equal]=')) return 'stock-bas'
  return 'tous'
}

function activeMaison(search: string): MaisonChip | null {
  if (search.includes('[edition][equals]=editions-sociales')) return 'es'
  if (search.includes('[edition][equals]=la-dispute')) return 'la-dispute'
  return null
}

export function BooksFilterChips({ seuil, borne }: BooksFilterChipsProps) {
  // `URLSearchParams.toString()` percent-encode les crochets (`[` → `%5B`) :
  // décodage obligatoire avant les `includes` sur crochets littéraux de
  // `activeEtat`/`activeMaison` (garde : une URL forgée avec un `%` orphelin
  // ferait planter `decodeURIComponent` — on retombe sur la chaîne brute).
  const rawSearch = useSearchParams().toString()
  let search: string
  try {
    search = decodeURIComponent(rawSearch)
  } catch {
    search = rawSearch
  }
  const etat = activeEtat(search)
  const maison = activeMaison(search)

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <div className={styles.group} role="group" aria-label="Filtrer par état">
          {ETAT_CHIPS.map((chip) => {
            const active = chip.key === etat
            const href = buildHref(chip.key, maison, seuil, borne)
            const label = chip.key === 'stock-bas' ? `${chip.label} (≤ ${seuil})` : chip.label
            return (
              <a
                key={chip.key}
                href={href}
                aria-current={active ? 'true' : undefined}
                className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              >
                {label}
              </a>
            )
          })}
        </div>

        <span className={styles.divider} aria-hidden="true" />

        <div className={styles.group} role="group" aria-label="Filtrer par maison">
          {MAISON_CHIPS.map((chip) => {
            const active = chip.key === maison
            // Recliquer une chip maison déjà active la désactive (bascule).
            const href = buildHref(etat, active ? null : chip.key, seuil, borne)
            return (
              <a
                key={chip.key}
                href={href}
                aria-current={active ? 'true' : undefined}
                className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              >
                {chip.label}
              </a>
            )
          })}
        </div>

        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route admin Payload (catch-all `(payload)/admin/[[...segments]]`), navigation par ancre pleine comme le reste du back-office */}
        <a className={styles.newBookButton} href="/admin/collections/books/create">
          + Nouveau livre
        </a>
      </div>
    </div>
  )
}
