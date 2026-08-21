'use client'

import { useSearchParams } from 'next/navigation'

import styles from './orders-filter-chips.module.css'

/**
 * Chips de filtre de la liste Commandes (`/admin/collections/orders`) — un
 * seul groupe, exclusif : Toutes | À traiter | Précommandes | Dons |
 * Remboursées | Historique Woo. Calque de
 * `rencontres/RencontresFilterChips.tsx` (même découpage RSC/client, même
 * convention `where[...]`).
 *
 * Toutes les chips passent par la même armature `where[or][j][and][k]`
 * héritée de `books/BooksFilterChips.tsx` (`buildWhereHref`) : « À traiter »
 * a besoin de DEUX branches `or` (un OU logique entre statut payée et
 * préparée) — les autres n'en ont qu'une, mais réutilisent la même fonction
 * pour rester uniformes plutôt que de mélanger deux styles de construction
 * d'URL.
 *
 * Opérateur `contains` (jamais `like`/`not_like`) pour les deux filtres de
 * substring, par alignement avec le choix déjà documenté et vérifié de
 * `dashboard/data.ts:readWorkOrders` : `contains` se traduit en `ILIKE
 * '%valeur%'` simple (`@payloadcms/drizzle:operatorMap`, `sanitizeQueryValue.js`
 * enveloppe la valeur de `%` automatiquement CÔTÉ SERVEUR) ; `not_like`, lui,
 * NE l'enveloppe PAS (tracé dans `@payloadcms/drizzle/dist/queries/
 * sanitizeQueryValue.js` : seul `operator === 'contains'` déclenche
 * l'enveloppe) — passer une valeur nue à `not_like` produirait une égalité
 * stricte (`NOT ILIKE 'CMD'`), vraie pour presque toutes les lignes, un piège
 * silencieux. Aucun opérateur `not_contains` n'existe côté Payload
 * (`payload/dist/types/constants.js:validOperators`).
 *
 * - « À traiter » exclut l'historique WooCommerce via `[number][contains]=
 *   CMD` : `number` natif est TOUJOURS préfixé `CMD-######`
 *   (`order-number.ts:formatOrderNumber`), jamais un numéro Woo importé
 *   (purement numérique, cf. `CLAUDE.md` racine § Ubiquitous Language) —
 *   même filtre, mot pour mot, que `readWorkOrders`.
 * - « Historique Woo » s'isole par le marqueur CANONIQUE du domaine
 *   (`CLAUDE.md` racine : « les `Orders` au `stripeSessionId` préfixé
 *   `woo-<id>` sont l'historique WooCommerce ») via `[stripeSessionId]
 *   [contains]=woo-` — un `contains` positif (fiable, déjà éprouvé) plutôt
 *   qu'une négation sur `number` qui aurait exigé de contourner l'absence
 *   d'enveloppe de `not_like` en injectant des `%` à la main dans l'URL.
 *
 * Chaque chip mène à un href complet reconstruit de zéro à chaque clic — la
 * page repart donc toujours de 1 (aucun `page=…` reporté).
 *
 * Détection de la chip active : ensemble FERMÉ de combinaisons connues (pas
 * un filtre arbitraire) — on cherche la sous-chaîne `[champ][opérateur]=
 * valeur` propre à chaque filtre. `URLSearchParams.toString()`
 * percent-encode les crochets (`[` → `%5B`) : décodage obligatoire avant les
 * `includes` sur crochets littéraux (même piège et même garde que
 * `BooksFilterChips.tsx`/`RencontresFilterChips.tsx` — une URL forgée avec
 * un `%` orphelin ferait planter `decodeURIComponent`, on retombe sur la
 * chaîne brute).
 */

type Chip = 'toutes' | 'a-traiter' | 'precommandes' | 'dons' | 'remboursees' | 'historique-woo'

interface WhereCondition {
  field: string
  op: string
  value: string
}

const CHIPS: { key: Chip; label: string }[] = [
  { key: 'toutes', label: 'Toutes' },
  { key: 'a-traiter', label: 'À traiter' },
  { key: 'precommandes', label: 'Précommandes' },
  { key: 'dons', label: 'Dons' },
  { key: 'remboursees', label: 'Remboursées' },
  { key: 'historique-woo', label: 'Historique Woo' },
]

/** Un groupe `and[...]` par branche `or[...]` — `[]` pour « Toutes » (rien à filtrer). */
function buildWhereHref(orGroups: WhereCondition[][]): string {
  if (orGroups.length === 0) return '/admin/collections/orders'
  const query = orGroups
    .flatMap((andConditions, orIndex) =>
      andConditions.map(
        (cond, andIndex) =>
          `where[or][${orIndex}][and][${andIndex}][${cond.field}][${cond.op}]=${encodeURIComponent(cond.value)}`,
      ),
    )
    .join('&')
  return `/admin/collections/orders?${query}`
}

function buildHref(chip: Chip): string {
  switch (chip) {
    case 'a-traiter': {
      const shared: WhereCondition[] = [
        { field: 'orderType', op: 'not_equals', value: 'precommande' },
        { field: 'number', op: 'contains', value: 'CMD' },
      ]
      return buildWhereHref([
        [{ field: 'status', op: 'equals', value: 'paid' }, ...shared],
        [{ field: 'status', op: 'equals', value: 'prepared' }, ...shared],
      ])
    }
    case 'precommandes':
      return buildWhereHref([[{ field: 'orderType', op: 'equals', value: 'precommande' }]])
    case 'dons':
      return buildWhereHref([[{ field: 'orderType', op: 'equals', value: 'don' }]])
    case 'remboursees':
      return buildWhereHref([[{ field: 'status', op: 'equals', value: 'refunded' }]])
    case 'historique-woo':
      return buildWhereHref([[{ field: 'stripeSessionId', op: 'contains', value: 'woo-' }]])
    case 'toutes':
    default:
      return buildWhereHref([])
  }
}

function activeChip(search: string): Chip {
  if (search.includes('[status][equals]=paid') && search.includes('[number][contains]=CMD')) {
    return 'a-traiter'
  }
  if (search.includes('[orderType][equals]=precommande')) return 'precommandes'
  if (search.includes('[orderType][equals]=don')) return 'dons'
  if (search.includes('[status][equals]=refunded')) return 'remboursees'
  if (search.includes('[stripeSessionId][contains]=woo-')) return 'historique-woo'
  return 'toutes'
}

export function OrdersFilterChips() {
  // `URLSearchParams.toString()` percent-encode les crochets : décodage
  // obligatoire avant les `includes` sur crochets littéraux d'`activeChip`
  // (garde : une URL forgée avec un `%` orphelin ferait planter
  // `decodeURIComponent` — on retombe sur la chaîne brute).
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
        <div className={styles.group} role="group" aria-label="Filtrer les commandes">
          {CHIPS.map((chip) => {
            const isActive = chip.key === active
            return (
              <a
                key={chip.key}
                href={buildHref(chip.key)}
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
