import { describe, expect, it } from "vitest";
import {
  activeChips,
  buildCatalogueView,
  catalogueHref,
  clearFilters,
  paginate,
  readFilters,
  withFilter,
  withoutFilter,
} from "./browse";
import type { Book, Facet } from "./types";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Fabrique un `Book` minimal pour les fixtures (seuls `id`/`title` varient). */
const makeBook = (id: number, overrides: Partial<Book> = {}): Book => ({
  id,
  edition: "editions-sociales",
  origin: "catalogue",
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
  status: "available",
  permalink: null,
  ...overrides,
});

const noFacets = { libelles: [] as Facet[], authors: [] as Facet[], total: 0 };

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
    expect(catalogueHref({ libelle: "geme" })).toBe("/catalogue?libelle=geme");
  });

  it("omet la page 1", () => {
    expect(catalogueHref({ page: 1 })).toBe("/catalogue");
    expect(catalogueHref({ libelle: "geme", page: 2 })).toContain("page=2");
  });

  it("respecte un basePath (édition dans le chemin)", () => {
    expect(catalogueHref({ libelle: "geme" }, "/catalogue/editions-sociales")).toBe(
      "/catalogue/editions-sociales?libelle=geme",
    );
  });
});

describe("withFilter / withoutFilter / clearFilters", () => {
  it("pose un filtre et remet à la page 1", () => {
    expect(withFilter({ libelle: "a", page: 3 }, "libelle", "b")).toEqual({
      libelle: "b",
      page: undefined,
    });
  });

  it("retire un filtre avec une valeur vide", () => {
    expect(withFilter({ libelle: "a" }, "libelle", "").libelle).toBeUndefined();
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
    const r = withoutFilter({ q: "x", libelle: "a", page: 4 }, "q");
    expect(r.q).toBeUndefined();
    expect(r.libelle).toBe("a");
    expect(r.page).toBeUndefined();
  });

  it("clearFilters ne conserve que le tri", () => {
    expect(clearFilters({ libelle: "a", sort: "titre", edition: "la-dispute" })).toEqual({
      sort: "titre",
    });
  });
});

describe("readFilters (inverse de l'encodeur)", () => {
  it("relit une query string en filtres validés", () => {
    const f = readFilters(new URLSearchParams("libelle=geme&page=2&sort=titre&upcoming=1"));
    expect(f).toMatchObject({ libelle: "geme", page: 2, sort: "titre", upcoming: true });
  });

  it("premier gagnant sur clé dupliquée (aligné sur le serveur)", () => {
    // ?libelle=a&libelle=b → le serveur (parseBookFilters) prend v[0]=\"a\".
    expect(readFilters(new URLSearchParams("libelle=a&libelle=b")).libelle).toBe("a");
  });

  it("aller-retour encode ∘ relit conserve les filtres", () => {
    const original = { libelle: "geme", author: "marx", sort: "ancien" as const, page: 2 };
    const href = catalogueHref(original);
    const qs = href.split("?")[1] ?? "";
    expect(readFilters(new URLSearchParams(qs))).toMatchObject(original);
  });
});

describe("activeChips", () => {
  const ctx = {
    libelles: [{ slug: "geme", name: "GEME" }],
    authors: [{ slug: "marx", name: "Karl Marx" }],
  };

  it("dérive un chip par filtre actif avec libellés résolus", () => {
    const chips = activeChips({ q: "état", libelle: "geme", author: "marx", upcoming: true }, ctx);
    expect(chips.map((c) => c.param)).toEqual(["q", "libelle", "author", "upcoming"]);
    expect(chips.find((c) => c.param === "libelle")?.label).toBe("GEME");
    expect(chips.find((c) => c.param === "author")?.label).toBe("Karl Marx");
  });

  it("masque le chip maison quand l'édition est verrouillée par le chemin", () => {
    const locked = activeChips({ edition: "la-dispute" }, { ...ctx, lockedEdition: "la-dispute" });
    expect(locked.some((c) => c.param === "edition")).toBe(false);
    const free = activeChips({ edition: "la-dispute" }, ctx);
    expect(free.some((c) => c.param === "edition")).toBe(true);
  });
});

describe("buildCatalogueView", () => {
  const books = range(50).map((i) => makeBook(i));

  it("découpe la fenêtre de pagination et reporte le total sur tout `all`", () => {
    const view = buildCatalogueView(books, noFacets, { page: 1 });
    expect(view.books).toHaveLength(24);
    expect(view.books[0]).toBe(books[0]);
    expect(view.page).toBe(1);
    expect(view.totalPages).toBe(3); // ceil(50/24)
    expect(view.total).toBe(50);
  });

  it("borne une page trop haute au dernier index et découpe la fenêtre restante", () => {
    const view = buildCatalogueView(books, noFacets, { page: 99 });
    expect(view.page).toBe(3);
    expect(view.books).toEqual(books.slice(48, 50));
    expect(view.total).toBe(50);
  });

  it("isUpcoming reflète filters.upcoming (true seulement si strictement `true`)", () => {
    expect(buildCatalogueView(books, noFacets, {}).isUpcoming).toBe(false);
    expect(buildCatalogueView(books, noFacets, { upcoming: true }).isUpcoming).toBe(true);
    expect(buildCatalogueView(books, noFacets, { upcoming: false }).isUpcoming).toBe(false);
  });

  it("passe les facettes telles quelles", () => {
    const facets = {
      libelles: [{ slug: "geme", name: "GEME", count: 3 }],
      authors: [{ slug: "marx", name: "Karl Marx", count: 5 }],
      total: 8,
    };
    const view = buildCatalogueView(books, facets, {});
    expect(view.facets).toBe(facets);
  });

  it("gère la liste vide (une page, aucun livre)", () => {
    const view = buildCatalogueView([], noFacets, {});
    expect(view.books).toEqual([]);
    expect(view.page).toBe(1);
    expect(view.totalPages).toBe(1);
    expect(view.total).toBe(0);
  });
});
