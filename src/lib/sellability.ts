/**
 * Cœur pur de la règle de vendabilité — LE seul endroit qui énonce le contrat
 * stock/parution (CLAUDE.md racine, « Stock ») : le stock EST la
 * disponibilité au sens STRICT (décision client 2026-09-04 — un stock vide
 * n'est plus assimilé à un suivi absent : 55 fiches parues sans stock
 * renseigné, dont des titres épuisés, étaient commandées à tort) — `null` =
 * indisponible à la commande (refus `untracked`), `0` = épuisé
 * (`out-of-stock`), `> 0` = commandable, jamais un plancher qui inventerait
 * un suivi. SEULE exemption : une fiche à paraître dont la précommande est
 * ouverte — avant parution le routeur ne connaît pas encore le titre, le
 * stock y est nécessairement vide. « à paraître » PRIME TOUJOURS, même sur
 * une fiche déjà cochée vendable avec du stock en préparation.
 *
 * Réénoncée auparavant dans `catalogue-core.ts:resolveNativePurchase` et
 * `checkout-core.ts:validateCheckoutLine` — même classe de dérive que la
 * copie d'`isUpcoming` réconciliée par a29f491, unifiée ici une bonne fois :
 * les deux consomment le même verdict et le traduisent chacun dans sa langue
 * (statut d'achat côté catalogue, refus de ligne motivé côté checkout).
 */

import { isoDayParis, parisMidnightUtc } from "./format";

/**
 * Un livre à date de parution future est-il « à paraître » ? Aujourd'hui en
 * ISO `YYYY-MM-DD`, comparaison lexicographique valide sur ce format. `now`
 * injectable pour les tests (défaut `new Date()`).
 */
export function isUpcoming(publishedAt: string | null, now: Date = new Date()): boolean {
  return publishedAt != null && publishedAt > now.toISOString().slice(0, 10);
}

/**
 * Jumeau requête d'`isUpcoming` — borne pour interroger Payload sur le
 * TIMESTAMP brut `dateParution` (vues admin : dashboard, chips de filtre ;
 * le front, lui, compare des jours déjà réduits). « À paraître » n'est PAS
 * un champ mais une conséquence de la date (décision client 2026-08-21,
 * suppression de l'ex-checkbox informative `aParaitre`) : une fiche est à
 * paraître ssi `dateParution >= borne`, parue sinon.
 *
 * La borne est l'instant UTC du minuit Europe/Paris du LENDEMAIN du jour
 * civil français de `now` : parution du jour = parue (strictement future
 * seulement, comme `isUpcoming`), correct dans les deux conventions de
 * stockage du picker `dayOnly` (minuit Paris d'une saisie admin, minuit UTC
 * d'un seed SQL — cf. `isoDayParis`, `format.ts`). `now` injectable pour les
 * tests.
 */
export function upcomingBoundaryUtc(now: Date = new Date()): string {
  const today = isoDayParis(now) ?? now.toISOString().slice(0, 10);
  // Lendemain calculé en UTC sur le jour civil déjà résolu — ajouter 24 h à
  // `now` glisserait sur le même jour lors d'un jour de 25 h (fin d'heure
  // d'été).
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return parisMidnightUtc(tomorrow);
}

/** Les faits dont le verdict a besoin — fournis par l'appelant (`CommerceInfo` du port ou `CheckoutBookLookup`), jamais relus ici. */
export interface SellabilityFacts {
  sellable: boolean;
  /**
   * `null` = stock non renseigné → refus `untracked` (indisponible à la
   * commande), SAUF à paraître + précommande ouverte (le routeur ne connaît
   * pas encore le titre — exemption limitée à ce seul cas) ; `0` = épuisé
   * (`out-of-stock`) ; `> 0` = plancher strict contre `qty`
   * (`insufficient-stock` si `stock < qty`).
   */
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
  | "untracked"
  | "out-of-stock"
  | "insufficient-stock";

export type SellabilityVerdict = { ok: true } | { ok: false; reason: SellabilityRefusal };

/**
 * Verdict de vendabilité pour `qty` exemplaires (1 par défaut — la question
 * « ce livre est-il achetable ? » du catalogue). Ordre des règles, fixé une
 * fois pour tous les appelants : à paraître (SAUF précommande ouverte) → non
 * vendable → stock non renseigné (`untracked`, SAUF à paraître + précommande
 * ouverte, seul cas où un stock vide vaut vendable) → épuisé (`stock ≤ 0`,
 * s'applique AUSSI à une précommande ouverte — saisir 0 ferme explicitement
 * la précommande) → stock insuffisant (`stock < qty`) → vendable.
 *
 * `preorderEnabled` ne fait QUE lever le refus `upcoming` ET, tant que la
 * fiche est encore à paraître, l'exemption ponctuelle du stock vide
 * ci-dessus — une fiche « à paraître » avec le drapeau coché retombe ensuite
 * dans les mêmes règles stock/vendable que n'importe quelle autre fiche (une
 * précommande décochée, non renseignée ou épuisée reste refusée).
 * L'appelant (catalogue, checkout) distingue un verdict `{ok:true}` obtenu
 * ainsi d'un verdict « normal » en relisant `isUpcoming(facts.publishedAt,
 * now)` lui-même — helper pur exporté ici, jamais une seconde règle de
 * refus.
 */
export function assessSellability(
  facts: SellabilityFacts,
  qty = 1,
  now: Date = new Date(),
): SellabilityVerdict {
  const upcoming = isUpcoming(facts.publishedAt, now);
  if (upcoming && !facts.preorderEnabled) {
    return { ok: false, reason: "upcoming" };
  }
  if (!facts.sellable) return { ok: false, reason: "not-sellable" };
  if (facts.stock == null) {
    // À ce point, `upcoming` implique forcément `preorderEnabled` (sinon le
    // premier `if` aurait déjà rendu la main) : avant parution, le routeur ne
    // connaît pas encore le titre — un stock vide y est attendu, pas un
    // défaut de suivi. Exemption limitée à ce seul cas (décision client
    // 2026-09-04) : une fiche déjà parue au stock vide est refusée.
    if (upcoming) return { ok: true };
    return { ok: false, reason: "untracked" };
  }
  if (facts.stock <= 0) return { ok: false, reason: "out-of-stock" };
  if (facts.stock < qty) return { ok: false, reason: "insufficient-stock" };
  return { ok: true };
}
