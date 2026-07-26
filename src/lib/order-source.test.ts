import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderCreateData } from "./order-webhook-core";

/**
 * Seam `order-source.ts` testé à travers son interface réelle (alias
 * `server-only` de vitest.config.ts) — patron de mock du module `payload`
 * déjà prouvé par `panier/actions.test.ts:53-65` : magasin en mémoire, on
 * capture les arguments passés à `find`/`create`/`update` pour asserter la
 * collection visée, la forme du `where`, `overrideAccess` et les `context`
 * — le contrat que ce module centralise. Aucune logique métier ici
 * (idempotence, décrément, refus de re-crédit) : elle reste dans
 * `order-handler.ts`, déjà couverte par `route.test.ts`.
 */

interface FakeOrder {
  id: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string | null;
  status?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface FakeBook {
  id: number;
  commerce: { stock: number | null };
}

interface FakeFindArgs {
  collection: string;
  where?: {
    stripeSessionId?: { equals?: string };
    stripePaymentIntentId?: { equals?: string };
  };
  sort?: string;
  limit?: number;
  overrideAccess?: boolean;
}

interface FakeFindByIdArgs {
  collection: string;
  id: number;
  depth?: number;
  overrideAccess?: boolean;
}

interface FakeCreateArgs {
  collection: string;
  data: Record<string, unknown>;
  overrideAccess?: boolean;
  context?: Record<string, unknown>;
}

interface FakeUpdateArgs {
  collection: string;
  id?: number;
  where?: { id?: { equals?: number }; "commerce.stock"?: { equals?: number | null } };
  limit?: number;
  data: Record<string, unknown>;
  overrideAccess?: boolean;
  context?: Record<string, unknown>;
}

let orders: FakeOrder[] = [];
let books: FakeBook[] = [];
let nextOrderId = 1;
let lastFindArgs: FakeFindArgs | null = null;
let lastCreateArgs: FakeCreateArgs | null = null;
let lastUpdateArgsByCollection: Record<string, FakeUpdateArgs> = {};
/** Simule un décrément concurrent glissé juste après la lecture (course #65) : consommé par `findByID`, une fois par appel. */
let raceOnNextBookRead = 0;

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({
  getPayload: async () => ({
    find: async (args: FakeFindArgs) => {
      lastFindArgs = args;
      if (args.collection !== "orders") {
        throw new Error(`collection inattendue dans le test : ${args.collection}`);
      }
      let docs = orders;
      if (args.where?.stripeSessionId?.equals != null) {
        const id = args.where.stripeSessionId.equals;
        docs = docs.filter((o) => o.stripeSessionId === id);
      }
      if (args.where?.stripePaymentIntentId?.equals != null) {
        const id = args.where.stripePaymentIntentId.equals;
        docs = docs.filter((o) => o.stripePaymentIntentId === id);
      }
      if (args.sort === "-updatedAt") {
        docs = [...docs].sort((a, b) => ((a.updatedAt ?? "") < (b.updatedAt ?? "") ? 1 : -1));
      }
      return { docs: docs.slice(0, args.limit ?? docs.length) };
    },
    findByID: async (args: FakeFindByIdArgs) => {
      if (args.collection !== "books") {
        throw new Error(`findByID inattendu dans le test : ${args.collection}`);
      }
      const book = books.find((b) => b.id === args.id);
      if (!book) throw new Error(`livre introuvable dans le test : ${args.id}`);
      const snapshot = { ...book, commerce: { ...book.commerce } };
      if (raceOnNextBookRead > 0 && book.commerce.stock != null) {
        // Une autre commande décrémente « pendant » notre lecture — la comparaison
        // (`where` gardé sur la valeur lue) échouera à l'écriture suivante.
        raceOnNextBookRead -= 1;
        book.commerce.stock = Math.max(0, book.commerce.stock - 1);
      }
      return snapshot;
    },
    create: async (args: FakeCreateArgs) => {
      lastCreateArgs = args;
      if (args.collection !== "orders") {
        throw new Error(`create inattendu dans le test : ${args.collection}`);
      }
      const doc: FakeOrder = { id: nextOrderId++, ...args.data };
      orders.push(doc);
      return doc;
    },
    update: async (args: FakeUpdateArgs) => {
      lastUpdateArgsByCollection[args.collection] = args;
      if (args.collection === "orders") {
        const order = orders.find((o) => o.id === args.id);
        if (order) Object.assign(order, args.data);
        return order;
      }
      if (args.collection === "books") {
        // Comparer-puis-échanger : ne matche que le livre dont le stock ACTUEL
        // égale la valeur du `where` (celle lue par `decrementBookStock`).
        const idEq = args.where?.id?.equals;
        const stockEq = args.where?.["commerce.stock"]?.equals;
        const matched = books.filter(
          (b) => b.id === idEq && (b.commerce.stock ?? null) === (stockEq ?? null),
        );
        const data = args.data as { commerce?: { stock?: number } };
        for (const b of matched) {
          if (data.commerce?.stock !== undefined) b.commerce.stock = data.commerce.stock;
        }
        return { docs: matched, errors: [] };
      }
      throw new Error(`update inattendu dans le test : ${args.collection}`);
    },
  }),
}));

const {
  createOrder,
  decrementBookStock,
  findLatestOrderUpdatedAt,
  findOrderByPaymentIntent,
  findOrderBySessionId,
  updateOrder,
} = await import("./order-source");

const ADDRESS = {
  fullName: "Jean Dupont",
  addressLine1: "1 rue Paul Lafargue",
  addressLine2: null,
  postalCode: "75001",
  city: "Paris",
  country: "FR" as const,
};

function orderCreateData(overrides: Partial<OrderCreateData> = {}): OrderCreateData {
  return {
    status: "paid",
    email: "client@exemple.fr",
    shippingAddress: ADDRESS,
    billingAddress: ADDRESS,
    lines: [
      { book: 12, titleSnapshot: "Le Capital", isbnSnapshot: "978-1", quantity: 2, unitPriceTTC: 15 },
    ],
    shippingMethod: "standard",
    shippingCostTTC: 6.5,
    promoCode: null,
    discountTTC: 0,
    totalTTC: 36.5,
    stripeSessionId: "cs_test_1",
    stripePaymentIntentId: "pi_test_1",
    paidAt: "2026-07-12T10:00:00.000Z",
    stockDecremented: false,
    confirmationSent: false,
    ...overrides,
  };
}

beforeEach(() => {
  orders = [];
  books = [];
  nextOrderId = 1;
  lastFindArgs = null;
  lastCreateArgs = null;
  lastUpdateArgsByCollection = {};
  raceOnNextBookRead = 0;
});

describe("findOrderBySessionId", () => {
  it("aucune commande pour cette session → null", async () => {
    const result = await findOrderBySessionId("cs_absente");
    expect(result).toBeNull();
  });

  it("cible la collection orders par stripeSessionId, overrideAccess: true, limit 1", async () => {
    orders = [{ id: 1, stripeSessionId: "cs_1" }];
    const result = await findOrderBySessionId("cs_1");
    expect(result).toMatchObject({ id: 1, stripeSessionId: "cs_1" });
    expect(lastFindArgs).toMatchObject({
      collection: "orders",
      where: { stripeSessionId: { equals: "cs_1" } },
      limit: 1,
      overrideAccess: true,
    });
  });
});

describe("findOrderByPaymentIntent", () => {
  it("aucune commande pour cette intention de paiement → null", async () => {
    const result = await findOrderByPaymentIntent("pi_absente");
    expect(result).toBeNull();
  });

  it("cible la collection orders par stripePaymentIntentId, overrideAccess: true, limit 1", async () => {
    orders = [{ id: 1, stripePaymentIntentId: "pi_1" }];
    const result = await findOrderByPaymentIntent("pi_1");
    expect(result).toMatchObject({ id: 1, stripePaymentIntentId: "pi_1" });
    expect(lastFindArgs).toMatchObject({
      collection: "orders",
      where: { stripePaymentIntentId: { equals: "pi_1" } },
      limit: 1,
      overrideAccess: true,
    });
  });
});

describe("createOrder", () => {
  it("crée dans orders avec overrideAccess: true et disableRevalidate: true, sans toucher contentTouched", async () => {
    const data = orderCreateData();
    const order = await createOrder(data);
    expect(order).toMatchObject({ id: 1, stripeSessionId: "cs_test_1", status: "paid" });
    expect(lastCreateArgs).toMatchObject({
      collection: "orders",
      data,
      overrideAccess: true,
      context: { disableRevalidate: true },
    });
    expect(orders).toHaveLength(1);
  });
});

describe("updateOrder", () => {
  it("met à jour le statut dans orders avec overrideAccess: true et disableRevalidate: true", async () => {
    orders = [{ id: 7, status: "paid" }];
    const updated = await updateOrder(7, { status: "refunded" });
    expect(updated).toMatchObject({ id: 7, status: "refunded" });
    expect(lastUpdateArgsByCollection.orders).toMatchObject({
      collection: "orders",
      id: 7,
      data: { status: "refunded" },
      overrideAccess: true,
      context: { disableRevalidate: true },
    });
  });

  it("pose les marqueurs d'effet du webhook (issue #64) — stockDecremented/confirmationSent", async () => {
    orders = [{ id: 9, stockDecremented: false, confirmationSent: false }];
    await updateOrder(9, { stockDecremented: true });
    expect(orders[0]).toMatchObject({ stockDecremented: true, confirmationSent: false });
    await updateOrder(9, { confirmationSent: true });
    expect(orders[0]).toMatchObject({ stockDecremented: true, confirmationSent: true });
  });
});

describe("decrementBookStock (issue #65 — écriture atomique)", () => {
  it("décrémente en une tentative quand rien ne bouge entre lecture et écriture", async () => {
    books = [{ id: 12, commerce: { stock: 5 } }];
    await decrementBookStock(12, 2);
    expect(books[0].commerce.stock).toBe(3);
    expect(lastUpdateArgsByCollection.books).toMatchObject({
      collection: "books",
      where: { id: { equals: 12 }, "commerce.stock": { equals: 5 } },
      data: { commerce: { stock: 3 } },
      overrideAccess: true,
      context: { migration: true, disableRevalidate: true },
    });
  });

  it("plancher à 0, jamais négatif", async () => {
    books = [{ id: 12, commerce: { stock: 1 } }];
    await decrementBookStock(12, 5);
    expect(books[0].commerce.stock).toBe(0);
  });

  it("stock non suivi (`null`) → aucune écriture", async () => {
    books = [{ id: 12, commerce: { stock: null } }];
    await decrementBookStock(12, 2);
    expect(books[0].commerce.stock).toBeNull();
    expect(lastUpdateArgsByCollection.books).toBeUndefined();
  });

  it("un décrément concurrent glissé entre la lecture et l'écriture fait échouer le comparer-puis-échanger → reprend sur le stock frais", async () => {
    books = [{ id: 12, commerce: { stock: 5 } }];
    raceOnNextBookRead = 1; // une seule course, consommée à la 1ère lecture
    await decrementBookStock(12, 2);
    // stock 5 → course concurrente (4) → notre décrément relu sur 4 → 4-2=2
    expect(books[0].commerce.stock).toBe(2);
  });

  it("concurrence persistante au-delà du nombre max de tentatives → jette plutôt qu'une boucle infinie", async () => {
    books = [{ id: 12, commerce: { stock: 5 } }];
    raceOnNextBookRead = Number.POSITIVE_INFINITY; // course à chaque tentative
    await expect(decrementBookStock(12, 1)).rejects.toThrow(/trop de tentatives/);
  });
});

describe("findLatestOrderUpdatedAt", () => {
  it("aucune commande en base → null", async () => {
    const result = await findLatestOrderUpdatedAt();
    expect(result).toBeNull();
  });

  it("renvoie l'updatedAt de la commande la plus récemment touchée (-updatedAt), pas la plus grande id", async () => {
    orders = [
      { id: 1, updatedAt: "2026-07-16T12:00:00.000Z" },
      { id: 2, updatedAt: "2026-07-17T11:30:00.000Z" }, // plus récent, id pourtant plus petit ne compte pas
    ];
    const result = await findLatestOrderUpdatedAt();
    expect(result).toBe("2026-07-17T11:30:00.000Z");
    expect(lastFindArgs).toMatchObject({
      collection: "orders",
      sort: "-updatedAt",
      limit: 1,
      overrideAccess: true,
    });
  });
});
