import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutBookLookup } from "@/lib/checkout-core";
import type { PromoCodeRecord } from "@/lib/commerce-source";
import type { Book } from "@/lib/types";

/**
 * Couche de composition de `/panier`, testée à travers ses interfaces réelles
 * (alias `server-only` de vitest.config.ts) : `@/lib/catalogue` et
 * `@/lib/commerce-source` sont de fines façades couvertes par leurs propres
 * tests (`catalogue-core.test.ts`, `commerce-source.test.ts` — c'est là que
 * vivent la normalisation du code promo et le contrat anti-brouillon) — on ne
 * revérifie ici que la COMPOSITION : bons ids demandés, projection des
 * drapeaux depuis les faits de vente, découpage `getPromoCodeRecord` →
 * `evaluatePromoCode`. Plus aucun mock du SDK `payload` : l'I/O vit derrière
 * le seam.
 */

const BOOKS: Book[] = [
  {
    id: 1,
    edition: "editions-sociales",
    origin: "catalogue",
    slug: "capital",
    title: "Le Capital",
    authors: [],
    collection: null,
    isbn: null,
    price: 20,
    pages: null,
    publishedAt: null,
    cover: null,
    buy: { boutique: null, parislibrairies: null, lalibrairie: null },
    status: "available",
    permalink: "/catalogue/editions-sociales/capital",
    purchaseMode: "cart",
  },
];

vi.mock("@/lib/catalogue", () => ({ getAllBooks: async () => BOOKS }));

function record(overrides: Partial<CheckoutBookLookup> = {}): CheckoutBookLookup {
  return {
    title: "Le Capital",
    isbn: null,
    priceEuros: 20,
    publishedAt: null,
    sellable: true,
    stock: null,
    reducedShippingFlag: false,
    ...overrides,
  };
}

let bookRecords: Record<number, CheckoutBookLookup> = {};
let promoRecords: Record<string, PromoCodeRecord> = {};
let lastPromoCodeAsked: string | null = null;

vi.mock("@/lib/commerce-source", () => ({
  getCommerceBookRecords: async (ids: number[]) => {
    const map = new Map<number, CheckoutBookLookup>();
    for (const id of ids) {
      const rec = bookRecords[id];
      if (rec) map.set(id, rec);
    }
    return map;
  },
  getPromoCodeRecord: async (code: string) => {
    lastPromoCodeAsked = code;
    return promoRecords[code] ?? null;
  },
}));

const { getCartSnapshot, validatePromoCode } = await import("./actions");

beforeEach(() => {
  bookRecords = {};
  promoRecords = {};
  lastPromoCodeAsked = null;
});

describe("getCartSnapshot", () => {
  it("ids vides → aucune lecture, réponse vide", async () => {
    const snapshot = await getCartSnapshot([]);
    expect(snapshot).toEqual({ books: [], reducedShippingFlags: [] });
  });

  it("relit le catalogue courant et projette le drapeau de port réduit pour les ids demandés", async () => {
    bookRecords = { 1: record({ reducedShippingFlag: true }) };
    const snapshot = await getCartSnapshot([1]);
    expect(snapshot.books).toEqual(BOOKS);
    expect(snapshot.reducedShippingFlags).toEqual([{ id: 1, flag: true }]);
  });

  it("un id absent du catalogue est simplement omis (pas d'entrée fantôme)", async () => {
    const snapshot = await getCartSnapshot([999]);
    expect(snapshot.books).toEqual([]);
    expect(snapshot.reducedShippingFlags).toEqual([]);
  });
});

describe("validatePromoCode", () => {
  it("transmet le code saisi tel quel au seam (la normalisation vit dans commerce-source)", async () => {
    await validatePromoCode("  agreg2027 ", 10000);
    expect(lastPromoCodeAsked).toBe("  agreg2027 ");
  });

  it("code introuvable → not-found (jamais une exception)", async () => {
    const result = await validatePromoCode("INCONNU", 10000);
    expect(result).toEqual({
      ok: false,
      reason: "not-found",
      message: "Code promo introuvable.",
    });
  });

  it("code fixed_cart valide → discountCents dérivé du record du seam", async () => {
    promoRecords = {
      AGREG2027: {
        id: 7,
        code: "AGREG2027",
        type: "fixed_cart",
        amount: 5,
        minCart: null,
        expiresAt: null,
        active: true,
      },
    };
    const result = await validatePromoCode("AGREG2027", 10000);
    expect(result).toEqual({ ok: true, type: "fixed_cart", discountCents: 500 });
  });

  it("code inactif → refusé (inactive), le sous-total ne joue aucun rôle", async () => {
    promoRecords = {
      PROMO: {
        id: 8,
        code: "PROMO",
        type: "fixed_cart",
        amount: 5,
        minCart: null,
        expiresAt: null,
        active: false,
      },
    };
    const result = await validatePromoCode("PROMO", 10000);
    expect(result).toEqual({
      ok: false,
      reason: "inactive",
      message: "Ce code promo n’est plus actif.",
    });
  });
});
