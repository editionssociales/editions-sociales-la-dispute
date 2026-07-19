'use client'

import { useSearchParams } from 'next/navigation'

import styles from './books-filter-chips.module.css'

/**
 * Chips de filtre de la liste Livres (`/admin/collections/books`, issue
 * #26) — 2 groupes combinables :
 *
 * - **État** (exclusif entre chips d'état) : Tous | Brouillons | À paraître |
 *   Sans couverture | Stock bas (mêmes clauses que `readLowStock`,
 *   `dashboard/data.ts` : `commerce.sellable=true` ET `commerce.stock`
 *   existant ET `commerce.stock <= seuil` ET `aParaitre=false`).
 * - **Maison** (exclusif entre chips de maison) : ES | La Dispute.
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
function etatConditions(etat: EtatChip, seuil: number): WhereCondition[] {
  switch (etat) {
    case 'brouillons':
      return [{ field: '_status', op: 'equals', value: 'draft' }]
    case 'a-paraitre':
      return [{ field: 'aParaitre', op: 'equals', value: 'true' }]
    case 'sans-couverture':
      return [{ field: 'cover', op: 'exists', value: 'false' }]
    case 'stock-bas':
      return [
        { field: 'commerce.sellable', op: 'equals', value: 'true' },
        { field: 'commerce.stock', op: 'exists', value: 'true' },
        { field: 'commerce.stock', op: 'less_than_equal', value: String(seuil) },
        { field: 'aParaitre', op: 'equals', value: 'false' },
      ]
    case 'tous':
    default:
      return []
  }
}

/** Href de la liste Livres pour une combinaison (état, maison) — repart toujours de la page 1. */
function buildHref(etat: EtatChip, maison: MaisonChip | null, seuil: number): string {
  const conditions = etatConditions(etat, seuil)
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
  if (search.includes('[aParaitre][equals]=true')) return 'a-paraitre'
  if (search.includes('[cover][exists]=false')) return 'sans-couverture'
  if (search.includes('[commerce.stock][less_than_equal]=')) return 'stock-bas'
  return 'tous'
}

function activeMaison(search: string): MaisonChip | null {
  if (search.includes('[edition][equals]=editions-sociales')) return 'es'
  if (search.includes('[edition][equals]=la-dispute')) return 'la-dispute'
  return null
}

export function BooksFilterChips({ seuil }: BooksFilterChipsProps) {
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
            const href = buildHref(chip.key, maison, seuil)
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
            const href = buildHref(etat, active ? null : chip.key, seuil)
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
        <a className={styles.newBookButton} href="/admin/nouveau-livre">
          + Nouveau livre
        </a>
      </div>
    </div>
  )
}
