import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawBook } from "./catalogue-source";
import type { EditionSlug } from "./types";

/**
 * Vérifie le CÂBLAGE du garde-fou §5 (DEVOPS.md, `catalogue-integrity.ts`) au
 * bon point d'insertion : `getAllBooks()`, la façade qui combine les deux
 * fonds — seul endroit qui connaît le total avant fusion/cache ISR/build
 * (`generateStaticParams`). Sources http/pg substituées (pas de réseau, pas
 * de Postgres, alias `server-only` de `vitest.config.ts`, même pattern que
 * `panier/actions.test.ts`) ; la logique de seuil elle-même est couverte en
 * isolation par `catalogue-integrity.test.ts`.
 */

const rawBook = (id: number): RawBook => ({
  id,
  slug: `livre-${id}`,
  title: `Livre ${id}`,
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
});

// 117 ES + 178 LD = 295, le dernier chiffre connu (DEVOPS.md §1.3) — état par
// défaut, réinitialisé après chaque test.
const state = vi.hoisted(() => ({ es: 117, ld: 178 }));

vi.mock("./catalogue-http", () => ({
  httpCatalogueSource: () => ({
    listBooks: async (edition: EditionSlug) => {
      const count = edition === "editions-sociales" ? state.es : state.ld;
      const offset = edition === "editions-sociales" ? 0 : 100_000;
      return Array.from({ length: count }, (_, i) => rawBook(offset + i));
    },
    getBook: async () => null,
    listProducts: async () => [],
  }),
}));

vi.mock("./catalogue-pg", () => ({
  pgCatalogueSource: () => {
    throw new Error(
      "pgCatalogueSource ne doit pas être appelé — CATALOGUE_SOURCE n'est pas posée à `pg` dans ce test",
    );
  },
  listBoutiqueOnlyBooks: async () => [],
  getBoutiqueOnlyBook: async () => null,
}));

const { getAllBooks } = await import("./catalogue");

afterEach(() => {
  state.es = 117;
  state.ld = 178;
});

describe("getAllBooks — garde-fou catalogue tronqué câblé (DEVOPS.md §5)", () => {
  it("total proche du dernier chiffre connu → catalogue construit normalement", async () => {
    const books = await getAllBooks();
    expect(books).toHaveLength(295);
  });

  it("un fonds amputé (page WordPress en échec) → getAllBooks() jette, rien n'est construit ni mis en cache", async () => {
    state.es = 20; // chute franche : simule une pagination interrompue en cours de build
    await expect(getAllBooks()).rejects.toThrow(/catalogue tronqué/i);
  });

  it("dérive normale (quelques parutions de plus) → toujours aucune exception", async () => {
    state.es = 122; // 300 au total, +1.7%
    const books = await getAllBooks();
    expect(books).toHaveLength(300);
  });
});
