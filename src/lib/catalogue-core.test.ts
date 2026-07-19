import { describe, expect, it } from "vitest";
import {
  buildNativeBookDetail,
  buildNativeCatalogue,
  computeFacets,
  countByEdition,
  queryBooks,
  resolveNativePurchase,
  toBook,
} from "./catalogue-core";
import {
  inMemoryCatalogueSource,
  type CommerceInfo,
  type RawBook,
} from "./catalogue-source";
import type { EditionSlug } from "./types";

/* -------- fixtures brutes neutres (ce que le port transporte) --------
 *
 * Le dialecte de source (enveloppe Payload) est absorbé par l'adaptateur —
 * testé dans `catalogue-pg-map.test.ts`. Ici, le cœur : assemblage,
 * résolution d'achat, requêtes, facettes.
 */

const rawBook = (
  over: Partial<RawBook> & Pick<RawBook, "id" | "slug" | "title">,
): RawBook => ({
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

const sellable = (stock: number | null): CommerceInfo => ({ sellable: true, stock });
const notSellable: CommerceInfo = { sellable: false, stock: null };

const ES_BOOKS: RawBook[] = [
  rawBook({
    id: 1,
    slug: "capital",
    title: "Le Capital",
    authors: [{ name: "Karl Marx", slug: "marx" }],
    libelles: [{ name: "GEME", slug: "geme" }],
    price: 20,
    publishedAt: "2020-03-01",
    commerce: sellable(5),
    presentationHtml: "<p>Présentation <script>alert(1)</script></p>",
    furtherReadingHtml: "<p>Voir aussi</p>",
    tocUrl: "https://blob.vercel-storage.test/toc.pdf",
  }),
  rawBook({
    id: 2,
    slug: "ideologie",
    title: "L’Idéologie",
    authors: [{ name: "Karl Marx", slug: "marx" }],
    libelles: [{ name: "GEME", slug: "geme" }],
    buy: {
      boutique: null,
      parislibrairies: "https://parislibrairies.fr/ideologie",
      lalibrairie: null,
    },
  }),
  rawBook({ id: 3, slug: "avenir", title: "Avenir", publishedAt: "2999-01-01" }), // futur → à paraître
];

const LD_BOOKS: RawBook[] = [
  rawBook({
    id: 4,
    slug: "genre",
    title: "Le Genre",
    authors: [{ name: "Elsa Dorlin", slug: "dorlin" }],
    libelles: [{ name: "Genre & sexualités", slug: "genre-sexualites" }],
  }),
];

const BOUTIQUE_ONLY: RawBook[] = [
  rawBook({ id: 100, slug: "tote-bag", title: "Tote bag", commerce: sellable(null) }),
];

const rawByEdition: Partial<Record<EditionSlug, RawBook[]>> = {
  "editions-sociales": ES_BOOKS,
  "la-dispute": LD_BOOKS,
};

const CATALOGUE = buildNativeCatalogue(rawByEdition, BOUTIQUE_ONLY);

const bySlug = <T extends { slug: string }>(books: T[], slug: string) =>
  books.find((b) => b.slug === slug)!;

describe("toBook — travail indépendant de la source", () => {
  it("applique l'orthotypo française au titre, quelle que soit la source", () => {
    const book = toBook(
      "editions-sociales",
      rawBook({ id: 9, slug: "commune", title: "Vive la Commune !" }),
    );
    // `frenchTypo` insère une espace fine insécable (U+202F) avant le « ! ».
    expect(book.title).toBe("Vive la Commune\u202f!");
  });
});

describe("queryBooks (filtre + tri)", () => {
  it("filtre par libellé", () => {
    expect(queryBooks(CATALOGUE, { libelle: "geme" }).map((b) => b.slug).sort()).toEqual([
      "capital",
      "ideologie",
    ]);
  });

  it("filtre par édition (chemin) et par recherche plein-texte", () => {
    expect(queryBooks(CATALOGUE, { edition: "editions-sociales" })).toHaveLength(3);
    expect(queryBooks(CATALOGUE, { q: "capital" }).map((b) => b.slug)).toEqual(["capital"]);
  });

  it("filtre les à-paraître", () => {
    expect(queryBooks(CATALOGUE, { upcoming: true }).map((b) => b.slug)).toEqual(["avenir"]);
  });

  it("trie par titre", () => {
    expect(queryBooks(CATALOGUE, { sort: "titre" })[0].title).toBe("Avenir");
  });
});

describe("computeFacets (facettes dynamiques)", () => {
  it("compte les libellés et renvoie le total « tous les livres »", () => {
    const f = computeFacets(CATALOGUE, {});
    expect(f.libelles.find((c) => c.slug === "geme")?.count).toBe(2);
    expect(f.total).toBe(5);
  });

  it("restreint les auteurs au libellé actif (croisement des dimensions)", () => {
    const f = computeFacets(CATALOGUE, { libelle: "geme" });
    expect(f.authors.map((a) => a.slug)).toEqual(["marx"]);
    expect(f.authors[0].count).toBe(2);
  });
});

describe("countByEdition", () => {
  it("compte par fonds ou au global", () => {
    expect(countByEdition(CATALOGUE)).toBe(5);
    expect(countByEdition(CATALOGUE, "editions-sociales")).toBe(3);
    expect(countByEdition(CATALOGUE, "la-dispute")).toBe(1);
  });
});

describe("à travers le port en mémoire (bout en bout, sans réseau)", () => {
  const source = inMemoryCatalogueSource({ books: rawByEdition });

  it("charge et assemble via l'adaptateur", async () => {
    const [es, ld] = await Promise.all([
      source.listBooks("editions-sociales"),
      source.listBooks("la-dispute"),
    ]);
    const catalogue = buildNativeCatalogue(
      { "editions-sociales": es, "la-dispute": ld },
      BOUTIQUE_ONLY,
    );
    expect(catalogue).toHaveLength(5);
  });

  it("construit une fiche détail au HTML nettoyé (SafeHtml)", async () => {
    const raw = await source.getBook("editions-sociales", "capital");
    expect(raw).not.toBeNull();
    const detail = buildNativeBookDetail(
      "editions-sociales",
      raw!,
      "/catalogue/editions-sociales/capital",
    );
    expect(detail.status).toBe("available");
    expect(detail.presentation).toContain("<p>Présentation");
    expect(detail.presentation).not.toContain("script");
    expect(detail.furtherReading).toBe("<p>Voir aussi</p>");
    expect(detail.tocUrl).toBe("https://blob.vercel-storage.test/toc.pdf");
  });

  it("renvoie null pour un slug absent", async () => {
    expect(await source.getBook("la-dispute", "inconnu")).toBeNull();
  });
});

/* -------- résolution d'achat (Payload) -------- */

describe("resolveNativePurchase — dérivation du statut d'achat", () => {
  it("« à paraître » PRIME sur le stock : parution future + vendable + stock positif → upcoming quand même", () => {
    const book = rawBook({
      id: 1,
      slug: "avenir",
      title: "Avenir",
      publishedAt: "2999-01-01",
    });
    const resolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      sellable(10),
      "/catalogue/editions-sociales/avenir",
    );
    expect(resolved.status).toBe("upcoming");
    expect(resolved.permalink).toBeNull();
    expect(resolved.purchaseMode).toBe("legacy-link");
  });

  it("stock `null` = non suivi = disponible (jamais un plancher qui bloque la vente)", () => {
    const book = rawBook({ id: 2, slug: "capital", title: "Le Capital" });
    const resolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      sellable(null),
      "/catalogue/editions-sociales/capital",
    );
    expect(resolved).toEqual({
      status: "available",
      permalink: "/catalogue/editions-sociales/capital",
      purchaseMode: "cart",
    });
  });

  it("plancher strict : stock exactement à 0 → PAS disponible (épuisé), même vendable", () => {
    const book = rawBook({ id: 3, slug: "epuise", title: "Épuisé" });
    const resolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      sellable(0),
      "/catalogue/editions-sociales/epuise",
    );
    expect(resolved.status).toBe("unavailable");
  });

  it("stock positif + vendable → disponible, panier natif", () => {
    const book = rawBook({ id: 4, slug: "stock-ok", title: "Stock ok" });
    const resolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      sellable(3),
      "/catalogue/editions-sociales/stock-ok",
    );
    expect(resolved.status).toBe("available");
    expect(resolved.purchaseMode).toBe("cart");
  });

  it("non vendable (même avec du stock) → replie sur les liens externes s'il y en a", () => {
    const book = rawBook({
      id: 5,
      slug: "ideologie",
      title: "L'Idéologie",
      buy: { boutique: null, parislibrairies: "https://parislibrairies.fr/ideologie", lalibrairie: null },
    });
    const resolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      { sellable: false, stock: 50 },
      "/catalogue/editions-sociales/ideologie",
    );
    expect(resolved).toEqual({
      status: "external",
      permalink: "https://parislibrairies.fr/ideologie",
      purchaseMode: "legacy-link",
    });
  });

  it("stock à 0, sans lien externe → indisponible, mais jamais retiré (le livre reste dans le catalogue)", () => {
    const book = rawBook({ id: 6, slug: "epuise-sec", title: "Épuisé sec" });
    const resolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      sellable(0),
      "/catalogue/editions-sociales/epuise-sec",
    );
    expect(resolved).toEqual({ status: "unavailable", permalink: null, purchaseMode: "legacy-link" });
  });

  it("aucune donnée commerce (fiche jamais migrée) → jamais faussement disponible", () => {
    const book = rawBook({ id: 7, slug: "sans-commerce", title: "Sans commerce" });
    const resolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      notSellable,
      "/catalogue/editions-sociales/sans-commerce",
    );
    expect(resolved.status).toBe("unavailable");
  });
});

describe("buildNativeCatalogue — assemblage des fonds + boutique-seuls", () => {
  it("résout chaque fiche via son groupe `commerce`", () => {
    const raw: RawBook[] = [
      rawBook({ id: 1, slug: "capital", title: "Le Capital", commerce: sellable(5) }),
      rawBook({ id: 2, slug: "epuise", title: "Épuisé", commerce: sellable(0) }),
    ];
    const catalogue = buildNativeCatalogue({ "editions-sociales": raw });
    expect(catalogue).toHaveLength(2);
    expect(bySlug(catalogue, "capital").status).toBe("available");
    expect(bySlug(catalogue, "capital").permalink).toBe("/catalogue/editions-sociales/capital");
    expect(bySlug(catalogue, "epuise").status).toBe("unavailable");
  });

  it("ajoute les articles boutique-seuls (origin: boutique, edition: null) avec leur propre permalink interne", () => {
    const raw: RawBook[] = [rawBook({ id: 1, slug: "capital", title: "Le Capital", commerce: sellable(5) })];
    const boutiqueOnly: RawBook[] = [
      rawBook({ id: 100, slug: "tote-bag", title: "Tote bag", commerce: sellable(null) }),
    ];
    const catalogue = buildNativeCatalogue({ "editions-sociales": raw }, boutiqueOnly);
    expect(catalogue).toHaveLength(2);
    const extra = bySlug(catalogue, "tote-bag");
    expect(extra.edition).toBeNull();
    expect(extra.origin).toBe("boutique");
    expect(extra.status).toBe("available");
    expect(extra.permalink).toBe("/boutique/tote-bag");
  });

  it("un livre non vendable reste dans le catalogue (jamais retiré)", () => {
    const raw: RawBook[] = [
      rawBook({ id: 1, slug: "pas-vendable", title: "Pas vendable", commerce: notSellable }),
    ];
    const catalogue = buildNativeCatalogue({ "editions-sociales": raw });
    expect(catalogue).toHaveLength(1);
    expect(catalogue[0].status).toBe("unavailable");
  });
});

describe("buildNativeBookDetail", () => {
  it("construit une fiche détail résolue, HTML nettoyé (SafeHtml)", () => {
    const raw = rawBook({
      id: 1,
      slug: "capital",
      title: "Le Capital",
      commerce: sellable(5),
      presentationHtml: "<p>Présentation <script>alert(1)</script></p>",
    });
    const detail = buildNativeBookDetail("editions-sociales", raw, "/catalogue/editions-sociales/capital");
    expect(detail.status).toBe("available");
    expect(detail.purchaseMode).toBe("cart");
    expect(detail.presentation).toContain("<p>Présentation");
    expect(detail.presentation).not.toContain("script");
  });

  it("fiche boutique-seule : edition null, origin boutique", () => {
    const raw = rawBook({ id: 100, slug: "tote-bag", title: "Tote bag", commerce: sellable(null) });
    const detail = buildNativeBookDetail(null, raw, "/boutique/tote-bag", "boutique");
    expect(detail.edition).toBeNull();
    expect(detail.origin).toBe("boutique");
    expect(detail.status).toBe("available");
  });
});
