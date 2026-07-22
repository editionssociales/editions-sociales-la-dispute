'use client'

import { useSearchParams } from 'next/navigation'

import styles from './rencontres-filter-chips.module.css'

/**
 * Chips de filtre de la liste Rencontres (`/admin/collections/rencontres`)
 * — un seul groupe, exclusif : À venir | Passées | Toutes. Calque de
 * `books/BooksFilterChips.tsx` (même découpage RSC/client, même convention
 * `where[...]`), réduit à un seul groupe (pas de « maison » sur cette
 * collection).
 *
 * La borne temporelle (`borne`, ISO instant) est calculée côté serveur par
 * `RencontresFilterChipsPanel.tsx` (`parisMidnightUtc`, `src/lib/format.ts`)
 * — minuit civil FRANÇAIS du jour courant, PAS `<jour>T00:00:00Z` (qui
 * classerait « passée » toute la journée une rencontre du jour saisie dans
 * l'admin, cf. commentaire de `parisMidnightUtc`).
 *
 * Chaque chip mène à un `where[date][op]=<borne>&sort=...` complet
 * (convention du dépôt, cf. `Dashboard.tsx`) reconstruit de zéro à chaque
 * clic — la page repart donc toujours de 1.
 *
 * Détection de la chip active : ensemble FERMÉ de 3 combinaisons connues —
 * on cherche la sous-chaîne `[date][op]=` propre à chaque filtre.
 * `URLSearchParams.toString()` percent-encode les crochets (`[` → `%5B`) :
 * décodage obligatoire avant les `includes` sur crochets littéraux (même
 * piège et même garde que `BooksFilterChips.tsx` — une URL forgée avec un
 * `%` orphelin ferait planter `decodeURIComponent`, on retombe sur la
 * chaîne brute).
 */

interface RencontresFilterChipsProps {
  borne: string
}

type Chip = 'a-venir' | 'passees' | 'toutes'

const CHIPS: { key: Chip; label: string }[] = [
  { key: 'a-venir', label: 'À venir' },
  { key: 'passees', label: 'Passées' },
  { key: 'toutes', label: 'Toutes' },
]

/** Href de la liste Rencontres pour une chip donnée — repart toujours de la page 1. */
function buildHref(chip: Chip, borne: string): string {
  switch (chip) {
    case 'a-venir':
      return `/admin/collections/rencontres?where[date][greater_than_equal]=${encodeURIComponent(borne)}&sort=date`
    case 'passees':
      return `/admin/collections/rencontres?where[date][less_than]=${encodeURIComponent(borne)}&sort=-date`
    case 'toutes':
    default:
      return '/admin/collections/rencontres'
  }
}

function activeChip(search: string): Chip {
  if (search.includes('[date][greater_than_equal]=')) return 'a-venir'
  if (search.includes('[date][less_than]=')) return 'passees'
  return 'toutes'
}

export function RencontresFilterChips({ borne }: RencontresFilterChipsProps) {
  const rawSearch = useSearchParams().toString()
  let search: string
  try {
    search = decodeURIComponent(rawSearch)
  } catch {
    search = rawSearch
  }
  const active = activeChip(search)

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <div className={styles.group} role="group" aria-label="Filtrer par échéance">
          {CHIPS.map((chip) => {
            const isActive = chip.key === active
            const href = buildHref(chip.key, borne)
            return (
              <a
                key={chip.key}
                href={href}
                aria-current={isActive ? 'true' : undefined}
                className={isActive ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              >
                {chip.label}
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
