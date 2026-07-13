import { z } from "zod";
import type Stripe from "stripe";

/**
 * Cœur pur de la jauge de dons 2026 — sans I/O (convention `src/lib/CLAUDE.md`,
 * même découpage que `catalogue-core.ts`/`catalogue-http.ts`) : l'agrégation
 * (`sumDonations`) et le parsing d'une page de réponse Stripe
 * (`parseChargeSearchPage`, schéma zod) se testent sans réseau ;
 * `donations.ts` (`server-only`) ne fait que le fetch + la pagination et
 * délègue ici.
 *
 * Extrait à part parce que `donations.ts` importe `./stripe`, qui importe le
 * marqueur `server-only` — celui-ci jette systématiquement hors d'un build
 * Next (dont sous Vitest) : tester `sumDonations`/le parsing exige donc de ne
 * pas remonter jusqu'à cet import, comme pour `catalogue-core.ts`.
 */

/**
 * Vue étroite d'une charge Stripe — seuls les champs que la jauge exploite,
 * ancrés sur les types du SDK : si Stripe renommait un champ, le typecheck
 * casse ici plutôt qu'une jauge silencieusement à zéro.
 */
export type DonationCharge = Pick<Stripe.Charge, "amount_captured" | "amount_refunded">;

/**
 * Schéma du sous-ensemble exploité d'une page `GET /v1/charges/search` —
 * champs superflus tolérés (zod n'est pas strict par défaut), mais tout champ
 * exploité doit avoir la forme attendue : jamais de `NaN` dans l'agrégation.
 */
const chargeSearchPageSchema = z.object({
  data: z.array(
    z.object({
      amount_captured: z.number(),
      amount_refunded: z.number(),
    }) satisfies z.ZodType<DonationCharge>,
  ),
  has_more: z.boolean().optional(),
  next_page: z.string().nullable().optional(),
});

/** Une page de résultats `GET /v1/charges/search`, déjà validée. */
export interface ChargeSearchPage {
  charges: DonationCharge[];
  hasMore: boolean;
  nextPage: string | null;
}

/**
 * Valide et extrait une page de réponse `charges/search` — jette, avec le
 * détail du champ fautif, sur toute forme inattendue plutôt que de laisser
 * passer des montants inexploitables.
 */
export function parseChargeSearchPage(raw: unknown): ChargeSearchPage {
  const parsed = chargeSearchPageSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Stripe charges/search : réponse inattendue — ${z.prettifyError(parsed.error)}`,
    );
  }
  return {
    charges: parsed.data.data,
    hasMore: parsed.data.has_more === true,
    nextPage: parsed.data.next_page ?? null,
  };
}

/**
 * Agrégation pure : collecté net des remboursements (partiels compris),
 * nombre de contributions = charges à net strictement positif. Les
 * remboursements TOTAUX ne sont pas garantis exclus en amont : le filtre
 * `-refunded:'true'` de la requête (cf. `donations.ts`) laisse tout passer
 * quand le champ `refunded` n'est pas indexé (sandboxes Stripe) — une charge
 * intégralement remboursée arrive alors ici avec un net de 0 et ne doit
 * compter ni en euros ni en contributeur.
 */
export function sumDonations(charges: DonationCharge[]): {
  collected: number;
  contributors: number;
} {
  const nets = charges
    .map((c) => c.amount_captured - c.amount_refunded)
    .filter((net) => net > 0);
  const collectedMinor = nets.reduce((sum, net) => sum + net, 0);
  return { collected: collectedMinor / 100, contributors: nets.length };
}
