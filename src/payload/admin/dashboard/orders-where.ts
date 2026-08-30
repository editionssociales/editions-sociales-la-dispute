import type { Where } from 'payload'

/**
 * `Where` Payload partagés par les lecteurs de `data.ts` — module pur, zéro
 * I/O, testé dans `orders-where.test.ts`. Extrait de cinq lecteurs qui
 * réécrivaient chacun le même arbre : `readSalesWindow`/`readSalesHistory`/
 * `readPreorderTotals` (statuts vendus, deux premiers avec en plus la même
 * borne date) et `readWorkOrders`/`readPendingPreorders` (statuts « à
 * traiter » + exclusion de l'historique Woo). Une seule définition de
 * chacune de ces deux notions — un statut ajouté/retiré, ou un changement de
 * convention de borne, se corrige ici et se propage aux cinq lecteurs.
 *
 * NB requêtes commandes : `orders.status` est indexé (migration
 * `20260717_150000_orders_status_index`).
 */

/**
 * Statuts « vendus » — commandes réellement encaissées (`paid`/`prepared`/
 * `shipped`), jamais `refunded`/`cancelled`/`failed` (l'historique Woo porte
 * ~45 k€ d'annulées avec `totalTTC` non nul). Utilisé par `readSalesWindow`,
 * `readSalesHistory` et `readPreorderTotals` — AUCUN filtre `orderType` ici
 * (les dons ont aussi un statut `paid`/`prepared`/`shipped`) : l'étanchéité
 * comptable dons/ventes est appliquée en aval, dans les dérivations pures de
 * `derive.ts`, jamais dans cette lecture partagée.
 *
 * Sans `sinceIso` : juste le filtre de statut (cas `readPreorderTotals`, qui
 * ne fenêtre rien — total vie entière d'une campagne de précommande).
 * Avec `sinceIso` : le même filtre de statut ET la borne de date, sur
 * `paidAt` à défaut `createdAt` (les deux posés au même moment en pratique
 * par le webhook) — cas `readSalesWindow`/`readSalesHistory`.
 */
export function soldOrdersWhere(sinceIso?: string): Where {
  const statusFilter: Where = { status: { in: ['paid', 'prepared', 'shipped'] } }
  if (!sinceIso) return statusFilter
  return {
    and: [
      {
        or: [
          { paidAt: { greater_than_equal: sinceIso } },
          {
            and: [{ paidAt: { exists: false } }, { createdAt: { greater_than_equal: sinceIso } }],
          },
        ],
      },
      statusFilter,
    ],
  }
}

/**
 * Statuts « à traiter » (`paid`/`prepared`, jamais `shipped` — déjà expédiée)
 * + exclusion de l'historique Woo, sous forme de conditions à combiner par
 * `and` avec le filtre `orderType` propre à chaque appelant (`readWorkOrders`
 * exclut les précommandes, `readPendingPreorders` ne garde qu'elles).
 *
 * Exclusion Woo : `number` natif est TOUJOURS préfixé `CMD-######`
 * (`order-number.ts:formatOrderNumber`) ; un numéro Woo importé est purement
 * numérique (`number` = n° Woo brut, jamais `CMD-*`, cf. CLAUDE.md racine).
 * Filtre choisi : `number: { contains: 'CMD' }` — `contains` sur Postgres se
 * traduit en `ILIKE '%CMD%'` (`@payloadcms/drizzle: operatorMap`), donc en
 * substring simple, contrairement à l'opérateur `like` qui découpe la valeur
 * en mots ; pas besoin d'un second filtre `stripeSessionId not_like 'woo-'`
 * — les commandes `paid` de l'historique n'ont jamais ce préfixe.
 */
export function nonWooPendingOrdersWhere(): Where[] {
  return [{ status: { in: ['paid', 'prepared'] } }, { number: { contains: 'CMD' } }]
}
