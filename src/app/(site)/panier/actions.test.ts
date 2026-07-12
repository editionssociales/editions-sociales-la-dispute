import { describe, expect, it, vi } from "vitest";
import type { Book } from "@/lib/types";

/**
 * Couche de composition de `/panier`, testée à travers ses interfaces réelles
 * (alias `server-only` de vitest.config.ts) : `payload`/`@payload-config` sont
 * substitués (pas de réseau à intercepter ici, contrairement à Stripe —
 * `getPayload` parle directement à Postgres) ; `@/lib/catalogue` et
 * `@/lib/cart-source` sont eux aussi de fines façades déjà couvertes
 * indirectement par `catalogue-core.test.ts`/`shipping-core.test.ts` — on ne
 * revérifie ici que la COMPOSITION (bons arguments, bon mappage, bon
 * découpage promo-codes → `evaluatePromoCode`).
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
vi.mock("@/lib/cart-source", () => ({
  getReducedShippingFlags: async (ids: number[]) => new Map(ids.map((id) => [id, id === 1])),
}));

interface FakePromoDoc {
  code: string;
  type: "fixed_cart" | "free_shipping";
  amount?: number | null;
  minCart?: number | null;
  expiresAt?: string | null;
  active?: boolean | null;
}

let promoDocs: FakePromoDoc[] = [];
let lastFindArgs: unknown = null;

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({
  getPayload: async () => ({
    find: async (args: { collection: string; where?: { code?: { equals?: string } } }) => {
      lastFindArgs = args;
      if (args.collection !== "promo-codes") {
        throw new Error(`collection inattendue dans le test : ${args.collection}`);
      }
      const code = args.where?.code?.equals;
      return { docs: promoDocs.filter((d) => d.code === code) };
    },
  }),
}));

const { getCartSnapshot, validatePromoCode } = await import("./actions");

describe("getCartSnapshot", () => {
  it("ids vides → aucune lecture, réponse vide", async () => {
    const snapshot = await getCartSnapshot([]);
    expect(snapshot).toEqual({ books: [], reducedShippingFlags: [] });
  });

  it("relit le catalogue courant et le drapeau de port réduit pour les ids demandés", async () => {
    const snapshot = await getCartSnapshot([1]);
    expect(snapshot.books).toEqual(BOOKS);
    expect(snapshot.reducedShippingFlags).toEqual([{ id: 1, flag: true }]);
  });

  it("un id absent du catalogue est simplement omis (pas d'entrée fantôme)", async () => {
    const snapshot = await getCartSnapshot([999]);
    expect(snapshot.books).toEqual([]);
  });
});

describe("validatePromoCode", () => {
  it("normalise le code avant recherche (majuscules, espaces de bord)", async () => {
    promoDocs = [{ code: "AGREG2027", type: "fixed_cart", amount: 5, active: true }];
    await validatePromoCode("  agreg2027 ", 10000);
    expect(lastFindArgs).toMatchObject({
      collection: "promo-codes",
      where: { code: { equals: "AGREG2027" } },
      overrideAccess: true,
    });
  });

  it("code introuvable → not-found (jamais une exception)", async () => {
    promoDocs = [];
    const result = await validatePromoCode("INCONNU", 10000);
    expect(result).toEqual({
      ok: false,
      reason: "not-found",
      message: "Code promo introuvable.",
    });
  });

  it("code fixed_cart valide → discountCents dérivé du document Payload", async () => {
    promoDocs = [{ code: "AGREG2027", type: "fixed_cart", amount: 5, active: true }];
    const result = await validatePromoCode("AGREG2027", 10000);
    expect(result).toEqual({ ok: true, type: "fixed_cart", discountCents: 500 });
  });

  it("champs Payload absents (amount/minCart/expiresAt null) → défauts sûrs, pas de crash", async () => {
    promoDocs = [{ code: "PROMO", type: "fixed_cart", active: true }];
    const result = await validatePromoCode("PROMO", 10000);
    expect(result).toEqual({ ok: true, type: "fixed_cart", discountCents: 0 });
  });

  it("code inactif en base → refusé (inactive), le sous-total ne joue aucun rôle", async () => {
    promoDocs = [{ code: "PROMO", type: "fixed_cart", amount: 5, active: false }];
    const result = await validatePromoCode("PROMO", 10000);
    expect(result).toEqual({
      ok: false,
      reason: "inactive",
      message: "Ce code promo n’est plus actif.",
    });
  });
});
