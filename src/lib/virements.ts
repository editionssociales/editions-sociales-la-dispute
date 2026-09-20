import "server-only";
import config from "@payload-config";
import { unstable_cache } from "next/cache";
import { getPayload } from "payload";

/**
 * Lecture des contributions encaissées HORS Stripe — les virements bancaires
 * saisis/importés au back-office (collection `virements-souscription`,
 * demande client 2026-08-24). Seul lecteur : `donations.ts`, qui les
 * additionne aux charges Stripe pour la jauge de `/souscription`.
 *
 * Même style que `commerce-source.ts`/`catalogue-pg.ts` : `server-only`,
 * `getPayload({ config })` (singleton par process), pas de `cache()` React —
 * une seule lecture par rendu.
 *
 * Data-cache tagué `virements` (86400 s en filet — incident Neon 2026-09-19) :
 * `/souscription` se régénère CHAQUE MINUTE (fenêtre de 60 s héritée du fetch
 * Stripe de `donations.ts`), et sans ce cache chaque régénération lisait
 * Postgres — de quoi tenir le compute Neon éveillé en continu (autosuspend à
 * 5 min jamais atteint), cause probable de l'épuisement du quota du plan
 * Free. Les virements ne changent qu'à l'écriture back-office :
 * `revalidateSouscriptionNow` expire le tag (MÊME chaîne littérale) avant de
 * purger la page. Une lecture en échec jette (contrat ci-dessous) — rien
 * n'est alors mis en cache.
 *
 * Ne rattrape PAS ses erreurs : `getCampaign2026()` (son unique appelant)
 * absorbe toute panne en `null` et la page affiche alors une mention neutre
 * plutôt qu'un total faux — un virement manquant fausserait la jauge aussi
 * sûrement qu'une charge Stripe manquante.
 */

export interface VirementTotals {
  /** Euros (jamais de centimes ici : `montantEUR` est stocké en euros, comme `Orders.totalTTC`). */
  collected: number;
  /** Une contribution = une ligne à montant strictement positif — même définition que `sumDonations`. */
  contributors: number;
}

async function loadVirementTotals(): Promise<VirementTotals> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "virements-souscription",
    // Volume attendu : quelques dizaines de lignes (« quelques personnes »,
    // client) — une lecture complète, projetée sur le seul montant.
    select: { montantEUR: true },
    depth: 0,
    limit: 0,
    overrideAccess: true,
  });
  const montants = docs.map((doc) => doc.montantEUR).filter((montant) => montant > 0);
  return {
    collected: Math.round(montants.reduce((sum, montant) => sum + montant, 0) * 100) / 100,
    contributors: montants.length,
  };
}

// `unstable_cache` exige un store Next (absent sous Vitest) — même garde que
// `catalogue.ts`.
export const getVirementTotals: () => Promise<VirementTotals> =
  process.env.VITEST === "true"
    ? loadVirementTotals
    : unstable_cache(loadVirementTotals, ["virements-totals-v1"], {
        revalidate: 86400,
        tags: ["virements"],
      });
