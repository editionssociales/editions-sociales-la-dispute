import "server-only";
import { cache } from "react";
import { stripeEnabled } from "./stripe";
import { CAMPAIGN_KEY, type Campaign2026, deriveCampaign2026 } from "./donation-tiers";
import { addTotals, type DonationCharge, parseChargeSearchPage, sumDonations } from "./donations-core";
import { getVirementTotals } from "./virements";

/**
 * Jauge 2026 vivante — source de vérité = les **charges** Stripe elles-mêmes
 * (zéro stockage), symétrique de `boutique.ts` : fetch brut + `next: { revalidate,
 * tags }` (style maison, `src/lib/CLAUDE.md`) + mémoïsation par requête via
 * `cache()`. Raw `fetch` plutôt que le SDK `stripe.charges.search()` : c'est
 * l'option `next` de `fetch` (Next 16, opt-in explicite au cache) qui porte la
 * fenêtre de fraîcheur et le tag d'invalidation du webhook (E6) — le client
 * HTTP interne du SDK ne l'expose pas. Agrégation (`sumDonations`) et parsing
 * (`parseChargeSearchPage`) vivent dans `donations-core.ts`, pur et testé.
 */

const SEARCH_URL = "https://api.stripe.com/v1/charges/search";

/** Fenêtre de fraîcheur du fetch (s) — voir `src/app/CLAUDE.md` pour le budget de latence complet. */
const REVALIDATE = 60;

/**
 * Charges `succeeded`, non intégralement remboursées, de la campagne 2026.
 * La forme négation `-refunded:'true'` (et non `refunded:'false'`) : dans les
 * sandboxes Stripe le champ `refunded` n'est pas indexé par la Search API
 * (`refunded:'false'` ET `refunded:'true'` → 0 résultat, constaté le 13/07 en
 * recette E9 alors que `disputed:'false'` matche) — la négation matche alors
 * tout, et `sumDonations` neutralise les remboursements totaux via
 * `amount_captured − amount_refunded` (net 0, exclus du compte) ; là où le
 * champ est indexé (live), les deux formes sont équivalentes. Les partiels
 * restent nettés par `amount_refunded` dans tous les cas.
 */
const SEARCH_QUERY = `metadata['campaign']:'${CAMPAIGN_KEY}' AND status:'succeeded' AND -refunded:'true'`;

/** Garde-fou anti-boucle si Stripe renvoyait un `next_page` en boucle. */
const MAX_PAGES = 20;

/**
 * Récupère l'intégralité des charges de la campagne (pagination par `next_page`).
 * Jette en cas d'échec (clé absente, réseau, réponse invalide) — contrairement
 * à `boutique.ts` qui dégrade en liste partielle, ici l'appelant
 * (`getCampaign2026`) doit pouvoir distinguer « 0 don » de « Stripe
 * indisponible » et absorber cette dernière en `null`.
 */
export const getDonationTotals = cache(async (): Promise<DonationCharge[]> => {
  if (!stripeEnabled()) {
    throw new Error(
      "getDonationTotals() appelé sans STRIPE_SECRET_KEY valide (sk_test_… ou sk_live_…).",
    );
  }
  const key = process.env.STRIPE_SECRET_KEY!;

  const out: DonationCharge[] = [];
  let page: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", SEARCH_QUERY);
    url.searchParams.set("limit", "100");
    if (page) url.searchParams.set("page", page);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      // Fetch opt-in au cache (Next 16 : no-store par défaut) ; le tag
      // "donations" est celui invalidé par le webhook (E6, best-effort).
      next: { revalidate: REVALIDATE, tags: ["donations"] },
    });
    if (!res.ok) {
      throw new Error(`Stripe charges/search : ${res.status} ${res.statusText}`);
    }
    const parsed = parseChargeSearchPage(await res.json());
    out.push(...parsed.charges);
    if (!parsed.hasMore || !parsed.nextPage) break;
    page = parsed.nextPage;
  }
  return out;
});

/**
 * Vue-modèle de la campagne 2026 en cours, consommée par `/souscription`.
 * `null` sur **toute** erreur (clé absente, Stripe indisponible, réponse
 * malformée) — jamais un plantage. La page distingue alors deux cas : avant
 * l'ouverture (`stripeEnabled()` faux), jauge honnêtement à 0 ; en
 * campagne (clé posée), panne Stripe → compteur remplacé par une mention
 * neutre et barre non rendue, jamais un faux 0.
 *
 * DEUX sources depuis le 2026-08-24 (demande client) : les charges Stripe
 * (dons par carte) ET les virements bancaires saisis au back-office
 * (`virements.ts`) — « il y a quelques personnes qui nous font des virements
 * directement sur notre compte pour la souscription ». Somme pure
 * (`addTotals`), montants ET contributeur·rices : la jauge ne distingue pas
 * le moyen de paiement, une contribution est une contribution. La panne d'UNE
 * des deux sources retombe sur la même branche `null` que la panne Stripe —
 * une jauge amputée d'une source serait un faux total, pas une dégradation.
 */
export async function getCampaign2026(): Promise<Campaign2026 | null> {
  try {
    const [charges, virements] = await Promise.all([getDonationTotals(), getVirementTotals()]);
    return deriveCampaign2026(addTotals(sumDonations(charges), virements));
  } catch (err) {
    console.error("[donations] getCampaign2026 indisponible:", err);
    return null;
  }
}
