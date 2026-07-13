import { describe, expect, it } from "vitest";
import { parseChargeSearchPage, sumDonations, type DonationCharge } from "./donations-core";

/**
 * `donations.ts` (I/O, `server-only`) n'est volontairement pas importé ici :
 * comme `catalogue-http.ts`/`boutique.ts`, un module `server-only` jette dès
 * son import hors d'un build Next (dont sous Vitest) — la surface testable
 * est le cœur pur `donations-core.ts` (même convention que
 * `catalogue-core.test.ts` face à `catalogue-http.ts`).
 */

describe("sumDonations", () => {
  it("liste vide → 0 collecté, 0 contributeur", () => {
    expect(sumDonations([])).toEqual({ collected: 0, contributors: 0 });
  });

  it("charges pleines (non remboursées) : somme des montants captés, en euros", () => {
    const charges: DonationCharge[] = [
      { amount_captured: 5000, amount_refunded: 0 },
      { amount_captured: 1500, amount_refunded: 0 },
    ];
    expect(sumDonations(charges)).toEqual({ collected: 65, contributors: 2 });
  });

  it("remboursement partiel : le montant net (capté − remboursé) est retenu", () => {
    const charges: DonationCharge[] = [
      { amount_captured: 10000, amount_refunded: 3000 }, // 100 € payés, 30 € rendus → 70 €
      { amount_captured: 2000, amount_refunded: 0 },
    ];
    expect(sumDonations(charges)).toEqual({ collected: 90, contributors: 2 });
  });

  it("plusieurs remboursements partiels cumulés dans la liste", () => {
    const charges: DonationCharge[] = [
      { amount_captured: 5000, amount_refunded: 1000 },
      { amount_captured: 5000, amount_refunded: 2500 },
      { amount_captured: 5000, amount_refunded: 0 },
    ];
    // (50-10) + (50-25) + 50 = 40 + 25 + 50 = 115 €
    expect(sumDonations(charges)).toEqual({ collected: 115, contributors: 3 });
  });

  it("contributors compte les charges retenues, pas les euros", () => {
    const charges: DonationCharge[] = [
      { amount_captured: 100000, amount_refunded: 0 },
      { amount_captured: 1500, amount_refunded: 0 },
      { amount_captured: 1500, amount_refunded: 0 },
    ];
    expect(sumDonations(charges).contributors).toBe(3);
  });

  it("remboursement TOTAL (net 0) : ni euros ni contributeur — la requête ne garantit pas son exclusion (champ `refunded` non indexé en sandbox)", () => {
    const charges: DonationCharge[] = [
      { amount_captured: 5000, amount_refunded: 5000 }, // don de test remboursé (E11.5)
      { amount_captured: 2000, amount_refunded: 0 },
    ];
    expect(sumDonations(charges)).toEqual({ collected: 20, contributors: 1 });
  });

  it("tout est intégralement remboursé → 0/0 (la section jauge disparaît)", () => {
    const charges: DonationCharge[] = [
      { amount_captured: 5000, amount_refunded: 5000 },
      { amount_captured: 50000, amount_refunded: 50000 },
    ];
    expect(sumDonations(charges)).toEqual({ collected: 0, contributors: 0 });
  });
});

describe("parseChargeSearchPage — parsing de la réponse Stripe charges/search", () => {
  it("page complète : extrait charges/hasMore/nextPage, tolère les champs Stripe superflus", () => {
    const raw = {
      object: "search_result",
      url: "/v1/charges/search",
      data: [
        {
          id: "ch_1",
          object: "charge",
          status: "succeeded",
          refunded: false,
          amount_captured: 5000,
          amount_refunded: 0,
        },
        {
          id: "ch_2",
          object: "charge",
          status: "succeeded",
          refunded: false,
          amount_captured: 3500,
          amount_refunded: 500,
        },
      ],
      has_more: false,
      next_page: null,
    };
    const page = parseChargeSearchPage(raw);
    expect(page).toEqual({
      charges: [
        { amount_captured: 5000, amount_refunded: 0 },
        { amount_captured: 3500, amount_refunded: 500 },
      ],
      hasMore: false,
      nextPage: null,
    });
  });

  it("has_more=true avec next_page : nextPage porté pour la page suivante", () => {
    const page = parseChargeSearchPage({
      data: [{ amount_captured: 1000, amount_refunded: 0 }],
      has_more: true,
      next_page: "cursor-2",
    });
    expect(page.hasMore).toBe(true);
    expect(page.nextPage).toBe("cursor-2");
  });

  it("has_more absent/false → hasMore false, nextPage null", () => {
    expect(parseChargeSearchPage({ data: [] })).toEqual({
      charges: [],
      hasMore: false,
      nextPage: null,
    });
  });

  it("corps non-objet → jette", () => {
    expect(() => parseChargeSearchPage(null)).toThrow(/réponse inattendue/);
    expect(() => parseChargeSearchPage("oops")).toThrow(/réponse inattendue/);
  });

  it("`data` absent ou non-liste → jette plutôt que de planter en aval", () => {
    expect(() => parseChargeSearchPage({})).toThrow(/réponse inattendue/);
    expect(() => parseChargeSearchPage({ data: "oops" })).toThrow(/réponse inattendue/);
  });

  it("une charge sans montants numériques exploitables → jette en nommant le champ", () => {
    expect(() =>
      parseChargeSearchPage({ data: [{ id: "ch_1", amount_captured: "5000" }] }),
    ).toThrow(/amount_captured/);
  });
});
