/**
 * Cœur pur de la règle de vendabilité — LE seul endroit qui énonce le contrat
 * stock/parution (CLAUDE.md racine, « Stock ») : le stock EST la
 * disponibilité (`null` = non suivi = disponible, `0` = épuisé — jamais un
 * plancher qui inventerait un suivi) et « à paraître » PRIME TOUJOURS, même
 * sur une fiche déjà cochée vendable avec du stock en préparation.
 *
 * Réénoncée auparavant dans `catalogue-core.ts:resolveNativePurchase` et
 * `checkout-core.ts:validateCheckoutLine` — même classe de dérive que la
 * copie d'`isUpcoming` réconciliée par a29f491, unifiée ici une bonne fois :
 * les deux consomment le même verdict et le traduisent chacun dans sa langue
 * (statut d'achat côté catalogue, refus de ligne motivé côté checkout).
 */

/**
 * Un livre à date de parution future est-il « à paraître » ? Aujourd'hui en
 * ISO `YYYY-MM-DD`, comparaison lexicographique valide sur ce format. `now`
 * injectable pour les tests (défaut `new Date()`).
 */
export function isUpcoming(publishedAt: string | null, now: Date = new Date()): boolean {
  return publishedAt != null && publishedAt > now.toISOString().slice(0, 10);
}

/** Les faits dont le verdict a besoin — fournis par l'appelant (`CommerceInfo` du port ou `CheckoutBookLookup`), jamais relus ici. */
export interface SellabilityFacts {
  sellable: boolean;
  /** `null` = stock non suivi = disponible ; sinon plancher strict (`0` = épuisé). */
  stock: number | null;
  /** Parution ISO `YYYY-MM-DD` — future = refus `upcoming`, quel que soit le reste. */
  publishedAt: string | null;
  /**
   * Coché sur la fiche (`Books.ts:commerce.preorder`, décision client
   * 2026-08-20) — lève le refus `upcoming` pour CETTE fiche : un livre « à
   * paraître » avec ce drapeau devient achetable en précommande, mais les
   * règles stock/vendable s'appliquent ENSUITE normalement (une précommande
   * peut donc être refusée pour rupture ou fiche décochée, comme n'importe
   * quelle autre ligne). Optionnel — absent/`false` = comportement
   * historique inchangé (`upcoming` refuse toujours).
   */
  preorderEnabled?: boolean;
}

export type SellabilityRefusal =
  | "upcoming"
  | "not-sellable"
  | "out-of-stock"
  | "insufficient-stock";

export type SellabilityVerdict = { ok: true } | { ok: false; reason: SellabilityRefusal };

/**
 * Verdict de vendabilité pour `qty` exemplaires (1 par défaut — la question
 * « ce livre est-il achetable ? » du catalogue). Ordre des règles, fixé une
 * fois pour tous les appelants : à paraître (SAUF précommande ouverte) → non
 * vendable → épuisé (`stock ≤ 0`) → stock insuffisant (`stock < qty`) →
 * vendable.
 *
 * `preorderEnabled` ne fait QUE lever le premier refus — une fiche « à
 * paraître » avec le drapeau coché retombe ensuite dans les mêmes règles
 * stock/vendable que n'importe quelle autre fiche (une précommande décochée
 * ou épuisée reste refusée). L'appelant (catalogue, checkout) distingue un
 * verdict `{ok:true}` obtenu ainsi d'un verdict « normal » en relisant
 * `isUpcoming(facts.publishedAt, now)` lui-même — helper pur exporté ici,
 * jamais une seconde règle de refus.
 */
export function assessSellability(
  facts: SellabilityFacts,
  qty = 1,
  now: Date = new Date(),
): SellabilityVerdict {
  if (isUpcoming(facts.publishedAt, now) && !facts.preorderEnabled) {
    return { ok: false, reason: "upcoming" };
  }
  if (!facts.sellable) return { ok: false, reason: "not-sellable" };
  if (facts.stock != null) {
    if (facts.stock <= 0) return { ok: false, reason: "out-of-stock" };
    if (facts.stock < qty) return { ok: false, reason: "insufficient-stock" };
  }
  return { ok: true };
}
