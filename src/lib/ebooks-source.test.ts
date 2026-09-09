import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contrat de `ebooks-source.ts`, testé à travers son interface réelle (alias
 * `server-only` de vitest.config.ts) — même patron de mock du module
 * `payload` que `catalogue-pg.test.ts`/`commerce-source.test.ts` : magasin en
 * mémoire, on capture les arguments passés à `find` pour asserter la
 * collection visée, la forme du `where` (collection `ebooks`,
 * `numeriqueSeul: { equals: true }`) et `overrideAccess: true` (le drapeau
 * conditionne un fait PUBLIC — port/adresse/stock au catalogue et au
 * checkout — malgré la lecture RESTREINTE d'`Ebooks.access.read`).
 */

interface FakeEbookDoc {
  livre: number | { id: number };
}

interface FakeFindArgs {
  collection: string;
  where?: { livre?: { in?: number[] }; numeriqueSeul?: { equals?: boolean } };
  overrideAccess?: boolean;
  depth?: number;
  limit?: number;
  select?: unknown;
}

let docsToReturn: FakeEbookDoc[] = [];
let lastFindArgs: FakeFindArgs | null = null;

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({
  getPayload: async () => ({
    find: async (args: FakeFindArgs) => {
      lastFindArgs = args;
      if (args.collection !== "ebooks") {
        throw new Error(`collection inattendue dans le test : ${args.collection}`);
      }
      return { docs: docsToReturn };
    },
  }),
}));

const { findDigitalOnlyBookIds } = await import("./ebooks-source");

beforeEach(() => {
  docsToReturn = [];
  lastFindArgs = null;
});

describe("findDigitalOnlyBookIds", () => {
  it("ids vides → ensemble vide, aucune lecture Payload", async () => {
    const result = await findDigitalOnlyBookIds([]);
    expect(result.size).toBe(0);
    expect(lastFindArgs).toBeNull();
  });

  it("cible `ebooks`, filtre par lot d'ids ET numeriqueSeul:true, overrideAccess:true (fait public malgré la lecture restreinte de la collection)", async () => {
    await findDigitalOnlyBookIds([1, 2, 3]);
    expect(lastFindArgs).toMatchObject({
      collection: "ebooks",
      where: { livre: { in: [1, 2, 3] }, numeriqueSeul: { equals: true } },
      overrideAccess: true,
      depth: 0,
      limit: 0,
    });
  });

  it("mappe les docs (livre non peuplé, simple id) en Set", async () => {
    docsToReturn = [{ livre: 2 }, { livre: 5 }];
    const result = await findDigitalOnlyBookIds([1, 2, 3, 5]);
    expect(result).toEqual(new Set([2, 5]));
  });

  it("mappe les docs (livre peuplé, `depth` supérieur en pratique) en Set — robustesse de forme", async () => {
    docsToReturn = [{ livre: { id: 7 } }];
    const result = await findDigitalOnlyBookIds([7]);
    expect(result).toEqual(new Set([7]));
  });

  it("aucun titre numérique seul dans le lot → ensemble vide", async () => {
    docsToReturn = [];
    const result = await findDigitalOnlyBookIds([1, 2]);
    expect(result.size).toBe(0);
  });
});
