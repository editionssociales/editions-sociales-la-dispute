import { describe, expect, it, vi } from "vitest";
import type { RawBook } from "./catalogue-source";
import type { EditionSlug } from "./types";

/**
 * Câblage de la façade `catalogue.ts` (alias `server-only` de
 * vitest.config.ts) : `./catalogue-pg` est substitué (adaptateur couvert par
 * `catalogue-pg.test.ts`, assemblage par `catalogue-core.test.ts`) — on ne
 * vérifie ici que la COMPOSITION : les deux fonds + les boutique-seuls
 * assemblés en un catalogue, la fiche détail construite depuis l'adaptateur.
 */

const rawBook = (id: number, over: Partial<RawBook> = {}): RawBook => ({
  id,
  slug: `livre-${id}`,
  title: `Livre ${id}`,
  authors: [],
  libelles: [],
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
  ...over,
});

vi.mock("./catalogue-pg", () => ({
  pgCatalogueSource: () => ({
    listBooks: async (edition: EditionSlug) =>
      edition === "editions-sociales"
        ? [rawBook(1, { commerce: { sellable: true, stock: 3 } }), rawBook(2)]
        : [rawBook(3)],
    getBook: async (edition: EditionSlug, slug: string) =>
      edition === "editions-sociales" && slug === "livre-1"
        ? rawBook(1, {
            commerce: { sellable: true, stock: 3 },
            presentationHtml: "<p>Présentation</p>",
          })
        : null,
  }),
  listBoutiqueOnlyBooks: async () => [
    rawBook(100, { slug: "tote-bag", title: "Tote bag", commerce: { sellable: true, stock: null } }),
  ],
  getBoutiqueOnlyBook: async (slug: string) =>
    slug === "tote-bag"
      ? rawBook(100, { slug: "tote-bag", title: "Tote bag", commerce: { sellable: true, stock: null } })
      : null,
}));

const { getAllBooks, getBook, getBoutiqueBook } = await import("./catalogue");

describe("getAllBooks — assemblage pg (deux fonds + boutique-seuls)", () => {
  it("compose les deux fonds et les articles boutique-seuls en un catalogue", async () => {
    const books = await getAllBooks();
    expect(books).toHaveLength(4);
    const toteBag = books.find((b) => b.slug === "tote-bag")!;
    expect(toteBag.origin).toBe("boutique");
    expect(toteBag.edition).toBeNull();
    expect(books.find((b) => b.id === 1)?.status).toBe("available");
  });
});

describe("getBook / getBoutiqueBook — fiches détail depuis l'adaptateur pg", () => {
  it("construit la fiche résolue (statut, SafeHtml) d'un livre du fonds", async () => {
    const detail = await getBook("editions-sociales", "livre-1");
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe("available");
    expect(detail!.purchaseMode).toBe("cart");
    expect(detail!.permalink).toBe("/catalogue/editions-sociales/livre-1");
  });

  it("renvoie null pour un slug inconnu", async () => {
    expect(await getBook("la-dispute", "inconnu")).toBeNull();
  });

  it("construit la fiche d'un article boutique-seul avec son permalink interne", async () => {
    const detail = await getBoutiqueBook("tote-bag");
    expect(detail).not.toBeNull();
    expect(detail!.origin).toBe("boutique");
    expect(detail!.permalink).toBe("/boutique/tote-bag");
  });
});
