/**
 * Cœur pur de la jauge de dons 2026 — sans I/O (convention `src/lib/CLAUDE.md`,
 * même découpage que `catalogue-core.ts`/`catalogue-http.ts`) : l'agrégation
 * (`sumDonations`) et le parsing d'une page de réponse Stripe
 * (`parseChargeSearchPage`) se testent sans réseau ; `donations.ts`
 * (`server-only`) ne fait que le fetch + la pagination et délègue ici.
 *
 * Extrait à part parce que `donations.ts` importe `./stripe`, qui importe le
 * marqueur `server-only` — celui-ci jette systématiquement hors d'un build
 * Next (dont sous Vitest) : tester `sumDonations`/le parsing exige donc de ne
 * pas remonter jusqu'à cet import, comme pour `catalogue-core.ts`.
 */

/** Vue étroite d'une charge Stripe — seuls les champs que la jauge exploite. */
export interface DonationCharge {
  amount_captured: number;
  amount_refunded: number;
}

/** Une page de résultats `GET /v1/charges/search`, déjà validée. */
export interface ChargeSearchPage {
  charges: DonationCharge[];
  hasMore: boolean;
  nextPage: string | null;
}

/**
 * Valide et extrait une page de réponse `charges/search` — jette sur toute
 * forme inattendue (corps non-objet, `data` non-liste, charge sans montants
 * numériques) plutôt que de laisser passer des `NaN` dans l'agrégation.
 */
export function parseChargeSearchPage(raw: unknown): ChargeSearchPage {
  if (!raw || typeof raw !== "object") {
    throw new Error("Stripe charges/search : réponse inattendue (corps non-objet)");
  }
  const body = raw as { data?: unknown; has_more?: unknown; next_page?: unknown };
  if (!Array.isArray(body.data)) {
    throw new Error("Stripe charges/search : réponse inattendue (data non-liste)");
  }
  const charges: DonationCharge[] = body.data.map((item, i) => {
    const c = item as { amount_captured?: unknown; amount_refunded?: unknown };
    if (typeof c.amount_captured !== "number" || typeof c.amount_refunded !== "number") {
      throw new Error(`Stripe charges/search : charge #${i} sans montants exploitables`);
    }
    return { amount_captured: c.amount_captured, amount_refunded: c.amount_refunded };
  });
  return {
    charges,
    hasMore: body.has_more === true,
    nextPage: typeof body.next_page === "string" ? body.next_page : null,
  };
}

/**
 * Agrégation pure : collecté net des remboursements (partiels compris — les
 * remboursements totaux sont déjà exclus en amont par le filtre
 * `refunded:'false'` de la requête Stripe), nombre de contributions = nombre
 * de charges retenues.
 */
export function sumDonations(charges: DonationCharge[]): {
  collected: number;
  contributors: number;
} {
  const collectedMinor = charges.reduce(
    (sum, c) => sum + (c.amount_captured - c.amount_refunded),
    0,
  );
  return { collected: collectedMinor / 100, contributors: charges.length };
}
