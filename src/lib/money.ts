/**
 * LA conversion euros↔centimes — jamais de flottant sur de l'argent (un
 * flottant sur de l'argent est le bug qu'on ne voit qu'en prod, cf.
 * `shipping-core.ts`). `eurosToCents` est consommée par `cart-core.ts`,
 * `checkout-core.ts` et `promo-core.ts` (prix/montants saisis en euros côté
 * Payload, re-convertis en centimes entiers pour tout calcul) ; `centsToEuros`
 * par `order-webhook-core.ts` (sens inverse, montants Stripe déjà en
 * centimes vers les champs `*TTC` en euros de `Orders.ts`).
 *
 * `order-export.ts:roundCents` reste séparé : ce n'est pas une conversion
 * euros↔centimes mais un arrondi d'un montant DÉJÀ en euros (ventilation TVA).
 */

/** Euros → centimes entiers, arrondi au centime. */
export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}

/** Centimes entiers → euros, arrondis au centime. */
export function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}
