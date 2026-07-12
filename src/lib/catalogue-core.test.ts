import { describe, expect, it } from "vitest";
import {
  buildBookDetail,
  buildCatalogue,
  computeFacets,
  countByEdition,
  queryBooks,
  toBook,
} from "./catalogue-core";
import {
  inMemoryCatalogueSource,
  type RawBook,
  type WcProduct,
} from "./catalogue-source";
import type { EditionSlug } from "./types";

/* -------- fixtures brutes neutres (ce que le port transporte) --------
 *
 * Les dialectes de source (entités WP, `Nom/Prénom`, chaînes ACF sales…) sont
 * absorbés par les adaptateurs — testés dans `catalogue-wp-map.test.ts` /
 * `catalogue-pg-map.test.ts`. Ici, le cœur : fusion, résolution d'achat,
 * requêtes, facettes.
 */

const rawBook = (
  over: Partial<RawBook> & Pick<RawBook, "id" | "slug" | "title">,
): RawBook => ({
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
  ...over,
});

const ES_BOOKS: RawBook[] = [
  rawBook({
    id: 1,
    slug: "capital",
    title: "Le Capital",
    authors: [{ name: "Karl Marx", slug: "marx" }],
    collection: { name: "GEME", slug: "geme" },
    price: 20,
    publishedAt: "2020-03-01",
    buy: {
      boutique: "https://boutique.editionssociales.fr/produit/capital/",
      parislibrairies: null,
      lalibrairie: null,
    },
    presentationHtml: "<p>Présentation <script>alert(1)</script></p>",
    furtherReadingHtml: "<p>Voir aussi</p>",
    tocUrl: "https://medias.ovh/toc.pdf",
  }),
  rawBook({
    id: 2,
    slug: "ideologie",
    title: "L’Idéologie",
    authors: [{ name: "Karl Marx", slug: "marx" }],
    collection: { name: "GEME", slug: "geme" },
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
    collection: { name: "Le genre du monde", slug: "genre-monde" },
  }),
];

const PRODUCTS: WcProduct[] = [
  {
    id: 99,
    slug: "capital",
    name: "Le Capital",
    permalink: "https://boutique.editionssociales.fr/capital",
    is_purchasable: true,
    is_in_stock: true,
    prices: { price: "1500", currency_minor_unit: 2 },
    images: [{ src: "http://boutique.editionssociales.fr/capital.jpg" }],
  },
  {
    id: 100,
    slug: "tote-bag",
    name: "Tote bag",
    permalink: "https://boutique.editionssociales.fr/tote-bag",
    is_purchasable: true,
    is_in_stock: true,
    prices: { price: "1200", currency_minor_unit: 2 },
  },
];

const rawByEdition: Partial<Record<EditionSlug, RawBook[]>> = {
  "editions-sociales": ES_BOOKS,
  "la-dispute": LD_BOOKS,
};

const bySlug = <T extends { slug: string }>(books: T[], slug: string) =>
  books.find((b) => b.slug === slug)!;

describe("buildCatalogue (fusion fonds + boutique)", () => {
  const catalogue = buildCatalogue(rawByEdition, PRODUCTS);

  it("fusionne les deux fonds puis ajoute les produits non réclamés", () => {
    expect(catalogue).toHaveLength(5); // 4 fiches + 1 produit sans fiche
    const extra = bySlug(catalogue, "tote-bag");
    expect(extra.edition).toBeNull();
    expect(extra.origin).toBe("boutique");
    expect(extra.status).toBe("available");
  });

  it("résout le prix et le lien d'achat depuis le produit associé", () => {
    const capital = bySlug(catalogue, "capital");
    expect(capital.status).toBe("available");
    expect(capital.price).toBe(15); // 1500 / 10^2
    expect(capital.permalink).toBe("https://boutique.editionssociales.fr/capital");
  });

  it("marque « en librairie » un livre à liens externes sans produit", () => {
    const ideologie = bySlug(catalogue, "ideologie");
    expect(ideologie.status).toBe("external");
    expect(ideologie.permalink).toBe("https://parislibrairies.fr/ideologie");
  });

  it("marque « à paraître » un livre à date future, « indisponible » sinon", () => {
    expect(bySlug(catalogue, "avenir").status).toBe("upcoming");
    expect(bySlug(catalogue, "genre").status).toBe("unavailable");
  });
});

describe("toBook — travail indépendant de la source", () => {
  it("applique l'orthotypo française au titre, quelle que soit la source", () => {
    const book = toBook(
      "editions-sociales",
      rawBook({ id: 9, slug: "commune", title: "Vive la Commune !" }),
    );
    expect(book.title).toBe("Vive la Commune !");
  });
});

describe("queryBooks (filtre + tri)", () => {
  const catalogue = buildCatalogue(rawByEdition, PRODUCTS);

  it("filtre par collection", () => {
    expect(queryBooks(catalogue, { collection: "geme" }).map((b) => b.slug).sort()).toEqual([
      "capital",
      "ideologie",
    ]);
  });

  it("filtre par édition (chemin) et par recherche plein-texte", () => {
    expect(queryBooks(catalogue, { edition: "editions-sociales" })).toHaveLength(3);
    expect(queryBooks(catalogue, { q: "capital" }).map((b) => b.slug)).toEqual(["capital"]);
  });

  it("filtre les à-paraître", () => {
    expect(queryBooks(catalogue, { upcoming: true }).map((b) => b.slug)).toEqual(["avenir"]);
  });

  it("trie par titre", () => {
    expect(queryBooks(catalogue, { sort: "titre" })[0].title).toBe("Avenir");
  });
});

describe("computeFacets (facettes dynamiques)", () => {
  const catalogue = buildCatalogue(rawByEdition, PRODUCTS);

  it("compte les collections et renvoie le total « tous les livres »", () => {
    const f = computeFacets(catalogue, {});
    expect(f.collections.find((c) => c.slug === "geme")?.count).toBe(2);
    expect(f.total).toBe(5);
  });

  it("restreint les auteurs à la collection active (croisement des dimensions)", () => {
    const f = computeFacets(catalogue, { collection: "geme" });
    expect(f.authors.map((a) => a.slug)).toEqual(["marx"]);
    expect(f.authors[0].count).toBe(2);
  });
});

describe("countByEdition", () => {
  it("compte par fonds ou au global", () => {
    const catalogue = buildCatalogue(rawByEdition, PRODUCTS);
    expect(countByEdition(catalogue)).toBe(5);
    expect(countByEdition(catalogue, "editions-sociales")).toBe(3);
    expect(countByEdition(catalogue, "la-dispute")).toBe(1);
  });
});

describe("à travers le port en mémoire (bout en bout, sans réseau)", () => {
  const source = inMemoryCatalogueSource({ books: rawByEdition, products: PRODUCTS });

  it("charge et fusionne via l'adaptateur", async () => {
    const [es, ld, products] = await Promise.all([
      source.listBooks("editions-sociales"),
      source.listBooks("la-dispute"),
      source.listProducts(),
    ]);
    const catalogue = buildCatalogue({ "editions-sociales": es, "la-dispute": ld }, products);
    expect(catalogue).toHaveLength(5);
  });

  it("construit une fiche détail au HTML nettoyé (SafeHtml)", async () => {
    const raw = await source.getBook("editions-sociales", "capital");
    expect(raw).not.toBeNull();
    const detail = buildBookDetail("editions-sociales", raw!, PRODUCTS);
    expect(detail.status).toBe("available");
    expect(detail.presentation).toContain("<p>Présentation");
    expect(detail.presentation).not.toContain("script");
    expect(detail.furtherReading).toBe("<p>Voir aussi</p>");
    expect(detail.tocUrl).toBe("https://medias.ovh/toc.pdf");
  });

  it("renvoie null pour un slug absent", async () => {
    expect(await source.getBook("la-dispute", "inconnu")).toBeNull();
  });
});
