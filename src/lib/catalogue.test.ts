import { describe, expect, it, vi } from "vitest";
import type { RawBook } from "./catalogue-source";
import type { EditionSlug } from "./types";

/**
 * Câblage de la façade `catalogue.ts` (alias `server-only` de
 * vitest.config.ts) : `./catalogue-pg` est substitué (adaptateur couvert par
 * `catalogue-pg.test.ts`, assemblage par `catalogue-core.test.ts`) — on ne
 * vérifie ici que la COMPOSITION : les deux fonds + les boutique-seuls
 * assemblés en un catalogue, la fiche détail dérivée du même jeu caché —
 * l'adaptateur mocké n'expose volontairement PAS de `getBook` propre : seul
 * `listBooks` fournit la donnée, preuve que `getBook` ne fait plus sa propre
 * requête.
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
  // `getBook` de `pgCatalogueSource()` n'est plus appelé par la façade
  // (dérivation depuis `listBooks`, cf. `catalogue.ts`) — mock non fourni,
  // `presentationHtml` posé directement sur la fiche de la liste.
  pgCatalogueSource: () => ({
    listBooks: async (edition: EditionSlug) =>
      edition === "editions-sociales"
        ? [
            rawBook(1, {
              commerce: { sellable: true, stock: 3 },
              presentationHtml: "<p>Présentation</p>",
            }),
            rawBook(2),
          ]
        : [rawBook(3)],
  }),
  listBoutiqueOnlyBooks: async () => [
    rawBook(100, { slug: "tote-bag", title: "Tote bag", commerce: { sellable: true, stock: null } }),
  ],
  getBoutiqueOnlyBook: async (slug: string) =>
    slug === "tote-bag"
      ? rawBook(100, { slug: "tote-bag", title: "Tote bag", commerce: { sellable: true, stock: null } })
      : null,
}));

const { getAllBooks, getBook, getBoutiqueBook, getBooks, getFacets, getNewReleases } =
  await import("./catalogue");

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

describe("goodies hors catalogue — règle client 2026-08-20", () => {
  it("getBooks (sans filtre) omet les articles boutique-seuls", async () => {
    const books = await getBooks();
    expect(books).toHaveLength(3);
    expect(books.some((b) => b.origin === "boutique")).toBe(false);
    expect(books.some((b) => b.slug === "tote-bag")).toBe(false);
  });

  it("getFacets n'inclut pas les boutique-seuls dans le total", async () => {
    const facets = await getFacets();
    expect(facets.total).toBe(3);
  });

  it("getNewReleases (nouveautés) n'inclut jamais un goodie", async () => {
    const releases = await getNewReleases(10);
    expect(releases.some((b) => b.origin === "boutique")).toBe(false);
  });

  it("getAllBooks reste inchangé (panier/checkout doivent voir les goodies)", async () => {
    const all = await getAllBooks();
    expect(all.some((b) => b.slug === "tote-bag")).toBe(true);
  });
});

describe("getBook / getBoutiqueBook — fiches détail depuis l'adaptateur pg", () => {
  it("construit la fiche résolue (statut, SafeHtml) d'un livre du fonds", async () => {
    const detail = await getBook("editions-sociales", "livre-1");
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe("available");
    expect(detail!.purchaseMode).toBe("cart");
    expect(detail!.permalink).toBe("/catalogue/editions-sociales/livre-1");
    // Le mock n'expose pas de `getBook` propre : ce champ ne peut venir que
    // de la fiche dérivée du jeu complet retourné par `listBooks`.
    expect(detail!.presentation).toContain("Présentation");
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
