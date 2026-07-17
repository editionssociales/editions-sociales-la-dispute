import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBook } from "./catalogue-source";

/**
 * Contrat de `catalogue-pg.ts`, testé à travers son interface réelle (alias
 * `server-only` de vitest.config.ts) — patron de mock du module `payload`
 * déjà prouvé par `panier/actions.test.ts:53-65` : magasin en mémoire, on
 * capture les arguments passés à `find` pour asserter la collection visée, la
 * forme du `where` et **`overrideAccess: false`** (le contrat anti-brouillon
 * documenté par le docblock de `catalogue-pg.ts`, jusqu'ici seulement
 * commenté, jamais vérifié par un test).
 *
 * `catalogue-pg-map.ts` est mocké (pas remappé pour de vrai) : on vérifie ici
 * la COMPOSITION — chaque doc renvoyé par `payload.find` passe bien par
 * `payloadBookToRawBook` — sans dupliquer `catalogue-pg-map.test.ts`, qui
 * couvre déjà le mapping lui-même.
 */

interface FakeDoc {
  id: number;
  slug: string;
}

/** Marqueur déterministe : prouve le passage par le mock sans reproduire un vrai `PayloadBook`. */
function mapDoc(doc: FakeDoc): RawBook {
  return {
    id: doc.id,
    slug: doc.slug,
    title: `mappé:${doc.slug}`,
    authors: [],
    collection: null,
    isbn: null,
    price: null,
    pages: null,
    publishedAt: null,
    cover: null,
    buy: { boutique: null, parislibrairies: null, lalibrairie: null },
    presentationHtml: null,
    furtherReadingHtml: null,
    tocUrl: null,
    excerptUrl: null,
  };
}

vi.mock("./catalogue-pg-map", () => ({
  payloadBookToRawBook: vi.fn(mapDoc),
}));

interface FakeFindArgs {
  collection: string;
  where?: unknown;
  draft?: boolean;
  overrideAccess?: boolean;
  depth?: number;
  sort?: string;
  limit?: number;
}

let docsToReturn: FakeDoc[] = [];
let lastFindArgs: FakeFindArgs | null = null;

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({
  getPayload: async () => ({
    find: async (args: FakeFindArgs) => {
      lastFindArgs = args;
      if (args.collection !== "books") {
        throw new Error(`collection inattendue dans le test : ${args.collection}`);
      }
      return { docs: docsToReturn };
    },
  }),
}));

const { getBoutiqueOnlyBook, listBoutiqueOnlyBooks, pgCatalogueSource } = await import("./catalogue-pg");
const { payloadBookToRawBook } = await import("./catalogue-pg-map");

const source = pgCatalogueSource();

beforeEach(() => {
  docsToReturn = [];
  lastFindArgs = null;
  vi.mocked(payloadBookToRawBook).mockClear();
});

describe("listBooks", () => {
  it("cible books, filtre par édition, overrideAccess:false, mappe chaque doc via payloadBookToRawBook", async () => {
    docsToReturn = [
      { id: 1, slug: "capital" },
      { id: 2, slug: "ideologie-allemande" },
    ];
    const result = await source.listBooks("editions-sociales");

    expect(lastFindArgs).toMatchObject({
      collection: "books",
      where: { edition: { equals: "editions-sociales" } },
      draft: false,
      overrideAccess: false,
      sort: "-sortDate",
      limit: 0,
    });
    expect(payloadBookToRawBook).toHaveBeenCalledTimes(2);
    // le mapper est passé à Array.map, qui ajoute (index, tableau) : seul le 1er argument fait contrat
    expect(vi.mocked(payloadBookToRawBook).mock.calls.map((call) => call[0])).toEqual(docsToReturn);
    expect(result).toEqual(docsToReturn.map(mapDoc));
  });

  it("aucune fiche pour ce fonds → liste vide, jamais d'appel au mapper", async () => {
    docsToReturn = [];
    const result = await source.listBooks("la-dispute");
    expect(result).toEqual([]);
    expect(payloadBookToRawBook).not.toHaveBeenCalled();
  });
});

describe("getBook", () => {
  it("cible books, filtre par édition + slug, overrideAccess:false, limit:1, mappe le doc trouvé", async () => {
    docsToReturn = [{ id: 3, slug: "capital" }];
    const result = await source.getBook("editions-sociales", "capital");

    expect(lastFindArgs).toMatchObject({
      collection: "books",
      where: { edition: { equals: "editions-sociales" }, slug: { equals: "capital" } },
      draft: false,
      overrideAccess: false,
      limit: 1,
    });
    expect(payloadBookToRawBook).toHaveBeenCalledExactlyOnceWith(docsToReturn[0]);
    expect(result).toEqual(mapDoc(docsToReturn[0]));
  });

  it("aucune fiche pour ce slug → null, jamais d'appel au mapper", async () => {
    docsToReturn = [];
    const result = await source.getBook("editions-sociales", "absente");
    expect(result).toBeNull();
    expect(payloadBookToRawBook).not.toHaveBeenCalled();
  });
});

describe("listBoutiqueOnlyBooks", () => {
  it("cible books, filtre par origin:boutique, overrideAccess:false, mappe chaque doc", async () => {
    docsToReturn = [{ id: 10, slug: "affiche-agreg" }];
    const result = await listBoutiqueOnlyBooks();

    expect(lastFindArgs).toMatchObject({
      collection: "books",
      where: { origin: { equals: "boutique" } },
      draft: false,
      overrideAccess: false,
      sort: "-sortDate",
      limit: 0,
    });
    expect(payloadBookToRawBook).toHaveBeenCalledTimes(1);
    // idem listBooks : appel via Array.map, seul le 1er argument fait contrat
    expect(vi.mocked(payloadBookToRawBook).mock.calls[0][0]).toEqual(docsToReturn[0]);
    expect(result).toEqual(docsToReturn.map(mapDoc));
  });
});

describe("getBoutiqueOnlyBook", () => {
  it("cible books, filtre par origin:boutique + slug, overrideAccess:false, limit:1", async () => {
    docsToReturn = [{ id: 11, slug: "tote-bag" }];
    const result = await getBoutiqueOnlyBook("tote-bag");

    expect(lastFindArgs).toMatchObject({
      collection: "books",
      where: { origin: { equals: "boutique" }, slug: { equals: "tote-bag" } },
      draft: false,
      overrideAccess: false,
      limit: 1,
    });
    expect(payloadBookToRawBook).toHaveBeenCalledExactlyOnceWith(docsToReturn[0]);
    expect(result).toEqual(mapDoc(docsToReturn[0]));
  });

  it("aucun article boutique pour ce slug → null, jamais d'appel au mapper", async () => {
    docsToReturn = [];
    const result = await getBoutiqueOnlyBook("absent");
    expect(result).toBeNull();
    expect(payloadBookToRawBook).not.toHaveBeenCalled();
  });
});
