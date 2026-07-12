import { describe, expect, it } from "vitest";
import {
  decodeCheckoutLines,
  encodeCheckoutLines,
  parseCheckoutRequest,
  resolveShippingMethod,
  validateCheckoutLine,
  validateCheckoutLines,
  type CheckoutBookLookup,
} from "./checkout-core";
import { MAX_LINE_QTY } from "./cart-core";

const NOW = new Date("2026-07-12T00:00:00.000Z");

function book(overrides: Partial<CheckoutBookLookup> = {}): CheckoutBookLookup {
  return {
    title: "Le Capital",
    isbn: "9780000000000",
    priceEuros: 15,
    publishedAt: "2020-01-01",
    sellable: true,
    stock: 10,
    reducedShippingFlag: false,
    ...overrides,
  };
}

describe("parseCheckoutRequest", () => {
  it("accepte un corps bien formé, ignore les champs superflus (prix forgé)", () => {
    const result = parseCheckoutRequest({
      lines: [{ id: 12, qty: 2, unitPriceCents: 1 }],
      zone: "FR",
      promoCode: "AGREG2027",
    });
    expect(result).toEqual({
      lines: [{ id: 12, qty: 2 }],
      zone: "FR",
      promoCode: "AGREG2027",
    });
  });

  it("promoCode absent → null (pas un refus)", () => {
    const result = parseCheckoutRequest({ lines: [{ id: 1, qty: 1 }], zone: "FR" });
    expect(result).toEqual({ lines: [{ id: 1, qty: 1 }], zone: "FR", promoCode: null });
  });

  it("panier vide → erreur", () => {
    expect(parseCheckoutRequest({ lines: [], zone: "FR" })).toEqual({ error: "Panier vide." });
  });

  it("corps non-objet → erreur", () => {
    expect(parseCheckoutRequest(null)).toEqual({ error: "Corps de requête invalide." });
    expect(parseCheckoutRequest("boum")).toEqual({ error: "Corps de requête invalide." });
  });

  it("id non entier positif → erreur", () => {
    expect(parseCheckoutRequest({ lines: [{ id: -1, qty: 1 }], zone: "FR" })).toEqual({
      error: "Identifiant de ligne invalide.",
    });
    expect(parseCheckoutRequest({ lines: [{ id: "12", qty: 1 }], zone: "FR" })).toEqual({
      error: "Identifiant de ligne invalide.",
    });
  });

  it("quantité non entière positive → erreur", () => {
    expect(parseCheckoutRequest({ lines: [{ id: 1, qty: 0 }], zone: "FR" })).toEqual({
      error: "Quantité de ligne invalide.",
    });
  });

  it("zone manquante → erreur", () => {
    expect(parseCheckoutRequest({ lines: [{ id: 1, qty: 1 }] })).toEqual({
      error: "Zone de livraison manquante.",
    });
  });

  it("quantité plafonnée à MAX_LINE_QTY (défense localStorage/requête forgée)", () => {
    const result = parseCheckoutRequest({ lines: [{ id: 1, qty: 9999 }], zone: "FR" });
    expect(result).toEqual({ lines: [{ id: 1, qty: MAX_LINE_QTY }], zone: "FR", promoCode: null });
  });
});

describe("validateCheckoutLine", () => {
  it("ligne valide → prix dérivé du livre relu, jamais du client", () => {
    const result = validateCheckoutLine({ id: 1, qty: 2 }, book({ priceEuros: 15 }), NOW);
    expect(result).toEqual({
      ok: true,
      line: {
        id: 1,
        qty: 2,
        titleSnapshot: "Le Capital",
        isbnSnapshot: "9780000000000",
        unitPriceCents: 1500,
        lineTotalCents: 3000,
        reducedShippingFlag: false,
      },
    });
  });

  it("livre introuvable (id absent de l'instantané relu) → refusé", () => {
    const result = validateCheckoutLine({ id: 99, qty: 1 }, undefined, NOW);
    expect(result).toEqual({
      ok: false,
      refusal: { id: 99, reason: "not-found", message: "Livre introuvable ou dépublié." },
    });
  });

  it("non vendable (`sellable: false`) → refusé", () => {
    const result = validateCheckoutLine({ id: 1, qty: 1 }, book({ sellable: false }), NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.reason).toBe("not-sellable");
  });

  it("parution future (à paraître) → refusé, même sellable/en stock", () => {
    const result = validateCheckoutLine(
      { id: 1, qty: 1 },
      book({ sellable: true, stock: 100, publishedAt: "2099-01-01" }),
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.reason).toBe("not-sellable");
  });

  it("stock insuffisant (qty demandée > stock) → refusé", () => {
    const result = validateCheckoutLine({ id: 1, qty: 5 }, book({ stock: 2 }), NOW);
    expect(result).toEqual({
      ok: false,
      refusal: {
        id: 1,
        reason: "insufficient-stock",
        message: "Stock insuffisant pour « Le Capital » (2 exemplaires disponibles).",
      },
    });
  });

  it("stock épuisé (0) → message dédié", () => {
    const result = validateCheckoutLine({ id: 1, qty: 1 }, book({ stock: 0 }), NOW);
    expect(!result.ok && result.refusal.message).toBe("« Le Capital » est épuisé.");
  });

  it("stock non suivi (`null`) → jamais un plancher, qty élevée acceptée", () => {
    const result = validateCheckoutLine({ id: 1, qty: 20 }, book({ stock: null }), NOW);
    expect(result.ok).toBe(true);
  });

  it("stock EXACTEMENT égal à la quantité demandée → accepté (plancher inclusif)", () => {
    const result = validateCheckoutLine({ id: 1, qty: 3 }, book({ stock: 3 }), NOW);
    expect(result.ok).toBe(true);
  });

  it("prix manquant (fiche incomplète) → refusé", () => {
    const result = validateCheckoutLine({ id: 1, qty: 1 }, book({ priceEuros: null }), NOW);
    expect(!result.ok && result.refusal.reason).toBe("no-price");
  });
});

describe("validateCheckoutLines", () => {
  it("toutes les lignes valides → sous-total + manifestOnly calculés", () => {
    const books = new Map([
      [1, book({ priceEuros: 10, reducedShippingFlag: true })],
      [2, book({ priceEuros: 20, reducedShippingFlag: true })],
    ]);
    const result = validateCheckoutLines(
      [
        { id: 1, qty: 2 },
        { id: 2, qty: 1 },
      ],
      books,
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      lines: [
        {
          id: 1,
          qty: 2,
          titleSnapshot: "Le Capital",
          isbnSnapshot: "9780000000000",
          unitPriceCents: 1000,
          lineTotalCents: 2000,
          reducedShippingFlag: true,
        },
        {
          id: 2,
          qty: 1,
          titleSnapshot: "Le Capital",
          isbnSnapshot: "9780000000000",
          unitPriceCents: 2000,
          lineTotalCents: 2000,
          reducedShippingFlag: true,
        },
      ],
      subtotalCents: 4000,
      manifestOnly: true,
    });
  });

  it("manifestOnly faux dès qu'UNE ligne n'a pas le drapeau", () => {
    const books = new Map([
      [1, book({ reducedShippingFlag: true })],
      [2, book({ reducedShippingFlag: false })],
    ]);
    const result = validateCheckoutLines(
      [
        { id: 1, qty: 1 },
        { id: 2, qty: 1 },
      ],
      books,
      NOW,
    );
    expect(result.ok && result.manifestOnly).toBe(false);
  });

  it("UNE seule ligne invalide → refuse la commande ENTIÈRE (jamais de commande partielle)", () => {
    const books = new Map([
      [1, book({ stock: 10 })],
      [2, book({ stock: 0 })],
    ]);
    const result = validateCheckoutLines(
      [
        { id: 1, qty: 1 },
        { id: 2, qty: 1 },
      ],
      books,
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusals).toEqual([
      { id: 2, reason: "insufficient-stock", message: "« Le Capital » est épuisé." },
    ]);
  });

  it("plusieurs lignes invalides → toutes les refusals remontées", () => {
    const books = new Map<number, CheckoutBookLookup>([[1, book({ stock: 0 })]]);
    const result = validateCheckoutLines([{ id: 1, qty: 1 }, { id: 2, qty: 1 }], books, NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusals.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe("resolveShippingMethod", () => {
  it("coupon gratuit prime sur manifeste", () => {
    expect(resolveShippingMethod({ manifestOnly: true, freeShippingCoupon: true })).toBe("offert");
  });
  it("manifeste sans coupon → réduit", () => {
    expect(resolveShippingMethod({ manifestOnly: true, freeShippingCoupon: false })).toBe("reduit");
  });
  it("ni l'un ni l'autre → standard", () => {
    expect(resolveShippingMethod({ manifestOnly: false, freeShippingCoupon: false })).toBe("standard");
  });
});

describe("encodeCheckoutLines / decodeCheckoutLines", () => {
  it("aller-retour fidèle", () => {
    const lines = [
      {
        id: 12,
        qty: 2,
        titleSnapshot: "Le Capital",
        isbnSnapshot: "978-1",
        unitPriceCents: 1500,
        lineTotalCents: 3000,
        reducedShippingFlag: false,
      },
      {
        id: 45,
        qty: 1,
        titleSnapshot: "Autre",
        isbnSnapshot: null,
        unitPriceCents: 2200,
        lineTotalCents: 2200,
        reducedShippingFlag: true,
      },
    ];
    const encoded = encodeCheckoutLines(lines);
    expect(encoded).toBe("12:2:1500;45:1:2200");
    expect(decodeCheckoutLines(encoded)).toEqual([
      { id: 12, qty: 2, unitPriceCents: 1500 },
      { id: 45, qty: 1, unitPriceCents: 2200 },
    ]);
  });

  it("décodage défensif : absent/vide/corrompu → jamais une exception", () => {
    expect(decodeCheckoutLines(undefined)).toEqual([]);
    expect(decodeCheckoutLines(null)).toEqual([]);
    expect(decodeCheckoutLines("")).toEqual([]);
    expect(decodeCheckoutLines("n'importe quoi")).toEqual([]);
    expect(decodeCheckoutLines("12:2:1500;corrompu;45:1:2200")).toEqual([
      { id: 12, qty: 2, unitPriceCents: 1500 },
      { id: 45, qty: 1, unitPriceCents: 2200 },
    ]);
  });
});
