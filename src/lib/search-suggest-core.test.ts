import { describe, expect, it } from "vitest";
import {
  buildSuggestionIndexData,
  emptySuggestionIndexData,
  prepareSuggestionIndex,
  querySuggestions,
  type SuggestionIndexData,
} from "./search-suggest-core";
import type { Book } from "./types";

/* ------------------------------- fixtures ------------------------------- */

const book = (over: Partial<Book> & Pick<Book, "id" | "slug" | "title" | "edition">): Book => ({
  origin: "catalogue",
  authors: [],
  libelles: [],
  isbn: null,
  price: null,
  pages: null,
  publishedAt: null,
  cover: null,
  buy: { boutique: null, parislibrairies: null, lalibrairie: null },
  status: "available",
  permalink: null,
  ...over,
});

const BOOKS: Book[] = [
  book({
    id: 1,
    slug: "capital",
    title: "Le Capital",
    edition: "editions-sociales",
    authors: [{ name: "Karl Marx", slug: "marx" }],
    libelles: [{ name: "GEME", slug: "geme" }],
    publishedAt: "2020-03-01",
  }),
  book({
    id: 2,
    slug: "ideologie",
    title: "L’Idéologie allemande",
    edition: "editions-sociales",
    authors: [{ name: "Karl Marx", slug: "marx" }],
    libelles: [{ name: "GEME", slug: "geme" }],
    publishedAt: "2024-05-01",
  }),
  book({
    id: 3,
    slug: "genre",
    title: "Le Genre du capital",
    edition: "la-dispute",
    authors: [{ name: "Céline Bessière", slug: "bessiere" }],
    libelles: [{ name: "Genre & sexualités", slug: "genre-sexualites" }],
    publishedAt: "2022-01-01",
  }),
  book({ id: 100, slug: "tote-bag", title: "Tote bag", edition: null, origin: "boutique" }),
];

const INDEX = buildSuggestionIndexData(BOOKS);
const PREPARED = prepareSuggestionIndex(INDEX);

const titleSlugs = (query: string, edition?: "editions-sociales" | "la-dispute") =>
  querySuggestions(PREPARED, query, { edition }).titles.map((t) => t.slug);

/* --------------------------------- index --------------------------------- */

describe("buildSuggestionIndexData", () => {
  it("projette les fiches par parution décroissante et écarte les boutique-seuls", () => {
    expect(INDEX.books.map((b) => b.slug)).toEqual(["ideologie", "genre", "capital"]);
  });

  it("dédoublonne auteurs et libellés avec count et fonds d'appartenance", () => {
    expect(INDEX.authors).toEqual([
      { name: "Karl Marx", slug: "marx", count: 2, editions: ["editions-sociales"] },
      { name: "Céline Bessière", slug: "bessiere", count: 1, editions: ["la-dispute"] },
    ]);
    expect(INDEX.libelles.map((l) => l.slug)).toEqual(["geme", "genre-sexualites"]);
  });

  it("l'index vide est la forme dégradée de la route", () => {
    expect(emptySuggestionIndexData()).toEqual({ books: [], authors: [], libelles: [] });
  });
});

/* -------------------------------- requêtes -------------------------------- */

describe("querySuggestions", () => {
  it("apparie les titres à travers accents, casse et apostrophe typographique", () => {
    expect(titleSlugs("ideologie")).toEqual(["ideologie"]);
    expect(titleSlugs("CAPITAL")).toEqual(expect.arrayContaining(["capital", "genre"]));
  });

  it("classe les débuts de mot du titre avant les autres appariements", () => {
    // « capital » ouvre un mot dans les deux titres — parution récente
    // départage ; « marx » n'apparie « capital »/« ideologie » que par
    // l'auteur (rang 1), aucun titre au rang 0.
    expect(titleSlugs("capital")).toEqual(["genre", "capital"]);
    expect(titleSlugs("marx")).toEqual(["ideologie", "capital"]);
  });

  it("un jeton par champ : « marx capital » croise titre et auteur", () => {
    expect(titleSlugs("marx capital")).toEqual(["capital"]);
  });

  it("un libellé apparie aussi ses livres (cohérence avec le filtre q de la grille)", () => {
    expect(titleSlugs("geme")).toEqual(["ideologie", "capital"]);
  });

  it("suggère auteurs et libellés avec leurs plages à surligner", () => {
    const { authors, libelles } = querySuggestions(PREPARED, "genre");
    expect(libelles).toEqual([
      {
        kind: "libelle",
        name: "Genre & sexualités",
        ranges: [{ start: 0, end: 5 }],
        slug: "genre-sexualites",
      },
    ]);
    expect(authors).toEqual([]);
    const marx = querySuggestions(PREPARED, "kArL").authors;
    expect(marx).toEqual([
      { kind: "author", name: "Karl Marx", ranges: [{ start: 0, end: 4 }], slug: "marx" },
    ]);
  });

  it("l'édition verrouillée restreint les trois groupes", () => {
    expect(titleSlugs("capital", "la-dispute")).toEqual(["genre"]);
    const scoped = querySuggestions(PREPARED, "e", { edition: "la-dispute" });
    expect(scoped.authors.map((a) => a.slug)).toEqual([]);
    const marxScoped = querySuggestions(PREPARED, "marx", { edition: "la-dispute" });
    expect(marxScoped.count).toBe(0);
  });

  it("porte le permalien de fiche et le libellé d'auteurs", () => {
    const [title] = querySuggestions(PREPARED, "ideologie").titles;
    expect(title.href).toBe("/catalogue/editions-sociales/ideologie");
    expect(title.authorsLabel).toBe("Karl Marx");
    expect(title.titleRanges).toEqual([{ start: 2, end: 11 }]);
  });

  it("requête vide ou blanche : aucun groupe", () => {
    expect(querySuggestions(PREPARED, "").count).toBe(0);
    expect(querySuggestions(PREPARED, "  ").count).toBe(0);
  });

  it("bornes par groupe : 3 titres, 3 auteurs, 2 libellés au plus", () => {
    // Trois titres SEULEMENT quel que soit le nombre d'appariements (retour
    // 2026-08-30) : les groupes Auteurs et Libellés restent sous le pli.
    const many = buildSuggestionIndexData([
      ...Array.from({ length: 14 }, (_, i) =>
        book({
          id: 200 + i,
          slug: `essai-${i}`,
          title: `Essai ${i}`,
          edition: "editions-sociales" as const,
          authors: [{ name: `Essayiste ${i}`, slug: `essayiste-${i}` }],
        }),
      ),
    ]);
    const result = querySuggestions(prepareSuggestionIndex(many), "essa");
    expect(result.titles).toHaveLength(3);
    expect(result.authors).toHaveLength(3);
    expect(result.libelles).toHaveLength(0);
    expect(result.count).toBe(6);
  });
});
