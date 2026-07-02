import { describe, expect, it } from "vitest";
import {
  activeChips,
  catalogueHref,
  clearFilters,
  paginate,
  readFilters,
  withFilter,
  withoutFilter,
} from "./browse";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("paginate", () => {
  it("borne, découpe et compte (page pleine)", () => {
    const r = paginate(range(50), 1, 24);
    expect(r.items).toHaveLength(24);
    expect(r.items[0]).toBe(0);
    expect(r.page).toBe(1);
    expect(r.totalPages).toBe(3); // ceil(50/24)
    expect(r.total).toBe(50);
  });

  it("découpe la dernière page partielle", () => {
    const r = paginate(range(50), 3, 24);
    expect(r.items).toEqual([48, 49]);
    expect(r.page).toBe(3);
  });

  it("borne une page trop haute au dernier index", () => {
    expect(paginate(range(50), 99, 24).page).toBe(3);
  });

  it("borne une page nulle ou négative à 1", () => {
    expect(paginate(range(50), 0, 24).page).toBe(1);
    expect(paginate(range(50), -5, 24).page).toBe(1);
  });

  it("gère la liste vide (une page, aucun item)", () => {
    const r = paginate([], 1, 24);
    expect(r.items).toEqual([]);
    expect(r.totalPages).toBe(1);
    expect(r.page).toBe(1);
  });

  it("défaut page 1 quand non fourni", () => {
    expect(paginate(range(50), undefined, 24).page).toBe(1);
  });
});

describe("catalogueHref", () => {
  it("chemin nu sans filtre", () => {
    expect(catalogueHref({})).toBe("/catalogue");
  });

  it("encode un filtre", () => {
    expect(catalogueHref({ collection: "geme" })).toBe("/catalogue?collection=geme");
  });

  it("omet la page 1", () => {
    expect(catalogueHref({ page: 1 })).toBe("/catalogue");
    expect(catalogueHref({ collection: "geme", page: 2 })).toContain("page=2");
  });

  it("respecte un basePath (édition dans le chemin)", () => {
    expect(catalogueHref({ collection: "geme" }, "/catalogue/editions-sociales")).toBe(
      "/catalogue/editions-sociales?collection=geme",
    );
  });
});

describe("withFilter / withoutFilter / clearFilters", () => {
  it("pose un filtre et remet à la page 1", () => {
    expect(withFilter({ collection: "a", page: 3 }, "collection", "b")).toEqual({
      collection: "b",
      page: undefined,
    });
  });

  it("retire un filtre avec une valeur vide", () => {
    expect(withFilter({ collection: "a" }, "collection", "").collection).toBeUndefined();
  });

  it("valide l'édition et le tri, ignore les valeurs inconnues", () => {
    expect(withFilter({}, "edition", "editions-sociales").edition).toBe("editions-sociales");
    expect(withFilter({}, "edition", "bogus").edition).toBeUndefined();
    expect(withFilter({}, "sort", "titre").sort).toBe("titre");
    expect(withFilter({}, "sort", "bogus").sort).toBeUndefined();
  });

  it("mappe upcoming=1 sur true", () => {
    expect(withFilter({}, "upcoming", "1").upcoming).toBe(true);
    expect(withFilter({}, "upcoming", "").upcoming).toBeUndefined();
  });

  it("withoutFilter retire par nom de paramètre et remet à la page 1", () => {
    const r = withoutFilter({ q: "x", collection: "a", page: 4 }, "q");
    expect(r.q).toBeUndefined();
    expect(r.collection).toBe("a");
    expect(r.page).toBeUndefined();
  });

  it("clearFilters ne conserve que le tri", () => {
    expect(clearFilters({ collection: "a", sort: "titre", edition: "la-dispute" })).toEqual({
      sort: "titre",
    });
  });
});

describe("readFilters (inverse de l'encodeur)", () => {
  it("relit une query string en filtres validés", () => {
    const f = readFilters(new URLSearchParams("collection=geme&page=2&sort=titre&upcoming=1"));
    expect(f).toMatchObject({ collection: "geme", page: 2, sort: "titre", upcoming: true });
  });

  it("premier gagnant sur clé dupliquée (aligné sur le serveur)", () => {
    // ?collection=a&collection=b → le serveur (parseBookFilters) prend v[0]=\"a\".
    expect(readFilters(new URLSearchParams("collection=a&collection=b")).collection).toBe("a");
  });

  it("aller-retour encode ∘ relit conserve les filtres", () => {
    const original = { collection: "geme", author: "marx", sort: "ancien" as const, page: 2 };
    const href = catalogueHref(original);
    const qs = href.split("?")[1] ?? "";
    expect(readFilters(new URLSearchParams(qs))).toMatchObject(original);
  });
});

describe("activeChips", () => {
  const ctx = {
    collections: [{ slug: "geme", name: "GEME" }],
    authors: [{ slug: "marx", name: "Karl Marx" }],
  };

  it("dérive un chip par filtre actif avec libellés résolus", () => {
    const chips = activeChips({ q: "état", collection: "geme", author: "marx", upcoming: true }, ctx);
    expect(chips.map((c) => c.param)).toEqual(["q", "collection", "author", "upcoming"]);
    expect(chips.find((c) => c.param === "collection")?.label).toBe("GEME");
    expect(chips.find((c) => c.param === "author")?.label).toBe("Karl Marx");
  });

  it("masque le chip maison quand l'édition est verrouillée par le chemin", () => {
    const locked = activeChips({ edition: "la-dispute" }, { ...ctx, lockedEdition: "la-dispute" });
    expect(locked.some((c) => c.param === "edition")).toBe(false);
    const free = activeChips({ edition: "la-dispute" }, ctx);
    expect(free.some((c) => c.param === "edition")).toBe(true);
  });
});
