import { describe, expect, it } from "vitest";
import { parseBookFilters, serializeBookFilters } from "./parse-filters";

describe("parseBookFilters", () => {
  it("valide et convertit des searchParams simples", () => {
    expect(
      parseBookFilters({
        edition: "la-dispute",
        libelle: "genre-sexualites",
        author: "vygotski-lev",
        q: "travail",
        sort: "ancien",
        page: "3",
        upcoming: "1",
      }),
    ).toEqual({
      edition: "la-dispute",
      libelle: "genre-sexualites",
      author: "vygotski-lev",
      q: "travail",
      sort: "ancien",
      page: 3,
      upcoming: true,
    });
  });

  it("mappe l'ancien paramètre collection vers le libellé correspondant", () => {
    expect(parseBookFilters({ collection: "le-genre-du-monde" }).libelle).toBe("genre-sexualites");
    expect(parseBookFilters({ collection: "geme" }).libelle).toBe("geme");
  });

  // La branche écrite pour la forme searchParams de Next (`?libelle=a&libelle=b`
  // arrive en tableau) : premier gagnant, aligné sur `readFilters` (browse.ts).
  it("prend la première valeur d'un paramètre répété (forme tableau de Next)", () => {
    expect(
      parseBookFilters({
        edition: ["editions-sociales", "la-dispute"],
        libelle: ["geme", "histoire"],
        author: ["x", "y"],
        q: ["marx", "engels"],
        sort: ["recent", "titre"],
        page: ["2", "9"],
        upcoming: ["1", "0"],
      }),
    ).toEqual({
      edition: "editions-sociales",
      libelle: "geme",
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
      libelle: undefined,
      author: undefined,
      q: undefined,
      sort: undefined,
      page: undefined,
      upcoming: undefined,
    });
  });

  it("sérialise en ?libelle= (jamais ?collection=)", () => {
    expect(serializeBookFilters({ libelle: "geme" }).toString()).toBe("libelle=geme");
  });
});
