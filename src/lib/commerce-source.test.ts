import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contrat de `commerce-source.ts`, testé à travers son interface réelle
 * (alias `server-only` de vitest.config.ts) — même patron de mock du module
 * `payload` que `catalogue-pg.test.ts` : magasin en mémoire, on capture les
 * arguments passés à `find` pour asserter la collection visée, la forme du
 * `where` et le contrat anti-brouillon (`PUBLIC_BOOKS_READ` étalé — `draft:
 * false` + `overrideAccess: false`), jusqu'ici recopié à la main dans chaque
 * source et jamais vérifié. La normalisation du code promo (majuscules,
 * espaces de bord) se vérifie ici aussi — elle vivait dans
 * `panier/actions.test.ts` quand la requête était inline.
 */

interface FakeBookDoc {
  id: number;
  title: string;
  isbn?: string | null;
  prix?: number | null;
  dateParution?: string | null;
  commerce?: {
    sellable?: boolean | null;
    stock?: number | null;
    reducedShippingFlag?: boolean | null;
  } | null;
}

interface FakePromoDoc {
  id: number;
  code: string;
  type: "fixed_cart" | "free_shipping";
  amount?: number | null;
  minCart?: number | null;
  expiresAt?: string | null;
  active?: boolean | null;
}

interface FakeFindArgs {
  collection: string;
  where?: { id?: { in?: number[] }; code?: { equals?: string } };
  draft?: boolean;
  overrideAccess?: boolean;
  depth?: number;
  limit?: number;
}

let bookDocs: FakeBookDoc[] = [];
let promoDocs: FakePromoDoc[] = [];
let lastFindArgs: FakeFindArgs | null = null;

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({
  getPayload: async () => ({
    find: async (args: FakeFindArgs) => {
      lastFindArgs = args;
      if (args.collection === "books") return { docs: bookDocs };
      if (args.collection === "promo-codes") {
        return { docs: promoDocs.filter((d) => d.code === args.where?.code?.equals) };
      }
      throw new Error(`collection inattendue dans le test : ${args.collection}`);
    },
  }),
}));

const { getCommerceBookRecords, getPromoCodeRecord } = await import("./commerce-source");

beforeEach(() => {
  bookDocs = [];
  promoDocs = [];
  lastFindArgs = null;
});

describe("getCommerceBookRecords", () => {
  it("ids vides → carte vide, aucune lecture Payload", async () => {
    const records = await getCommerceBookRecords([]);
    expect(records.size).toBe(0);
    expect(lastFindArgs).toBeNull();
  });

  it("lit `books` avec le contrat anti-brouillon (PUBLIC_BOOKS_READ) et depth 0", async () => {
    await getCommerceBookRecords([1, 2]);
    expect(lastFindArgs).toMatchObject({
      collection: "books",
      where: { id: { in: [1, 2] } },
      draft: false,
      overrideAccess: false,
      depth: 0,
      limit: 2,
    });
  });

  it("mappe un document complet en CheckoutBookLookup (date tronquée en ISO jour)", async () => {
    bookDocs = [
      {
        id: 1,
        title: "Le Capital",
        isbn: "978-1",
        prix: 15,
        dateParution: "2020-01-01T00:00:00.000Z",
        commerce: { sellable: true, stock: 3, reducedShippingFlag: true },
      },
    ];
    const records = await getCommerceBookRecords([1]);
    expect(records.get(1)).toEqual({
      title: "Le Capital",
      isbn: "978-1",
      priceEuros: 15,
      publishedAt: "2020-01-01",
      sellable: true,
      stock: 3,
      reducedShippingFlag: true,
    });
  });

  it("champs absents → défauts sûrs (null / false), jamais un crash", async () => {
    bookDocs = [{ id: 2, title: "Tote bag" }];
    const records = await getCommerceBookRecords([2]);
    expect(records.get(2)).toEqual({
      title: "Tote bag",
      isbn: null,
      priceEuros: null,
      publishedAt: null,
      sellable: false,
      stock: null,
      reducedShippingFlag: false,
    });
  });
});

describe("getPromoCodeRecord", () => {
  it("normalise le code avant recherche (majuscules, espaces de bord), overrideAccess assumé", async () => {
    promoDocs = [{ id: 7, code: "AGREG2027", type: "fixed_cart", amount: 5, active: true }];
    const record = await getPromoCodeRecord("  agreg2027 ");
    expect(lastFindArgs).toMatchObject({
      collection: "promo-codes",
      where: { code: { equals: "AGREG2027" } },
      overrideAccess: true,
      limit: 1,
    });
    expect(record?.id).toBe(7);
  });

  it("code introuvable → null (jamais une exception)", async () => {
    expect(await getPromoCodeRecord("INCONNU")).toBeNull();
  });

  it("champs Payload absents → défauts sûrs, id conservé pour la relation Orders", async () => {
    promoDocs = [{ id: 9, code: "PROMO", type: "free_shipping" }];
    expect(await getPromoCodeRecord("PROMO")).toEqual({
      id: 9,
      code: "PROMO",
      type: "free_shipping",
      amount: null,
      minCart: null,
      expiresAt: null,
      active: false,
    });
  });
});
