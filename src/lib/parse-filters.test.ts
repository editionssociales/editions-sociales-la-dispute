import { describe, expect, it } from "vitest";
import { parseBookFilters } from "./parse-filters";

describe("parseBookFilters", () => {
  it("valide et convertit des searchParams simples", () => {
    expect(
      parseBookFilters({
        edition: "la-dispute",
        collection: "le-genre-du-monde",
        author: "vygotski-lev",
        q: "travail",
        sort: "ancien",
        page: "3",
        upcoming: "1",
      }),
    ).toEqual({
      edition: "la-dispute",
      collection: "le-genre-du-monde",
      author: "vygotski-lev",
      q: "travail",
      sort: "ancien",
      page: 3,
      upcoming: true,
    });
  });

  // La branche écrite pour la forme searchParams de Next (`?collection=a&collection=b`
  // arrive en tableau) : premier gagnant, aligné sur `readFilters` (browse.ts).
  it("prend la première valeur d'un paramètre répété (forme tableau de Next)", () => {
    expect(
      parseBookFilters({
        edition: ["editions-sociales", "la-dispute"],
        collection: ["a", "b"],
        author: ["x", "y"],
        q: ["marx", "engels"],
        sort: ["recent", "titre"],
        page: ["2", "9"],
        upcoming: ["1", "0"],
      }),
    ).toEqual({
      edition: "editions-sociales",
      collection: "a",
      author: "x",
      q: "marx",
      sort: "recent",
      page: 2,
      upcoming: true,
    });
  });

  it("écarte les valeurs invalides (édition inconnue, tri inconnu, page non positive)", () => {
    expect(
      parseBookFilters({ edition: "gallimard", sort: "prix", page: "0", upcoming: "yes" }),
    ).toEqual({
      edition: undefined,
      collection: undefined,
      author: undefined,
      q: undefined,
      sort: undefined,
      page: undefined,
      upcoming: undefined,
    });
  });
});
