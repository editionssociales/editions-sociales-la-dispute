import { describe, expect, it } from "vitest";
import type { WcProduct } from "../src/lib/catalogue-source.ts";
import {
  buildProductRedirectTable,
  cleanProductTitle,
  matchedBookUpdate,
  matchProducts,
  orphanBookData,
  ORPHAN_DATE_PARUTION,
  type ArbitrageEntry,
  type BookRef,
} from "./migrate-products-core.ts";

function product(overrides: Partial<WcProduct> & { id: number; slug: string; name: string }): WcProduct {
  return {
    permalink: `https://boutique.editionssociales.fr/produit/${overrides.slug}/`,
    is_purchasable: true,
    is_in_stock: true,
    prices: { price: "1500", currency_minor_unit: 2 },
    images: [{ src: `https://boutique.editionssociales.fr/${overrides.slug}.jpg` }],
    ...overrides,
  };
}

function book(overrides: Partial<BookRef> & { id: number; slug: string }): BookRef {
  return {
    edition: "editions-sociales",
    boutiqueUrl: null,
    published: true,
    ...overrides,
  };
}

describe("matchProducts", () => {
  it("apparie une fiche à son produit par le slug extrait de buy.boutiqueUrl", () => {
    const p = product({ id: 1, slug: "decouvrir-gorz", name: "Découvrir Gorz" });
    const b = book({
      id: 10,
      slug: "decouvrir-gorz",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/decouvrir-gorz/",
    });

    const result = matchProducts([b], [p], []);

    expect(result.matched).toEqual([{ book: b, product: p }]);
    expect(result.orphans).toEqual([]);
    expect(result.pendingArbitrage).toEqual([]);
  });

  it("ne matche rien pour une fiche sans lien boutique — le produit reste orphelin", () => {
    const p = product({ id: 1, slug: "un-produit", name: "Un produit" });
    const b = book({ id: 10, slug: "une-fiche", boutiqueUrl: null });

    const result = matchProducts([b], [p], []);

    expect(result.matched).toEqual([]);
    expect(result.orphans).toEqual([p]);
  });

  it("une fiche couverte par un arbitrage sans résolution reste en attente — rien n'est écrit, le produit visé n'est pas orphelin", () => {
    const p = product({ id: 1, slug: "celine-marty-decouvrir-gorz", name: "Découvrir Gorz" });
    const b = book({
      id: 10,
      slug: "decouvrir-gorz",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/celine-marty-decouvrir-gorz-prevente/",
    });
    const arbitrage: ArbitrageEntry = {
      category: "lien-casse",
      bookSlug: "decouvrir-gorz",
      brokenSlug: "celine-marty-decouvrir-gorz-prevente",
      note: "dérive de slug post-prévente",
      candidate: "celine-marty-decouvrir-gorz",
      resolution: null,
    };

    const result = matchProducts([b], [p], [arbitrage]);

    expect(result.matched).toEqual([]);
    expect(result.pendingArbitrage).toEqual([arbitrage]);
    // Le produit candidat est réservé — pas auto-créé en orphelin tant que
    // l'arbitrage n'a pas tranché.
    expect(result.orphans).toEqual([]);
  });

  it("applique la résolution humaine une fois posée, même si le slug brut ne correspondait à rien", () => {
    const p = product({ id: 1, slug: "celine-marty-decouvrir-gorz", name: "Découvrir Gorz" });
    const b = book({
      id: 10,
      slug: "decouvrir-gorz",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/celine-marty-decouvrir-gorz-prevente/",
    });
    const arbitrage: ArbitrageEntry = {
      category: "lien-casse",
      bookSlug: "decouvrir-gorz",
      brokenSlug: "celine-marty-decouvrir-gorz-prevente",
      note: "dérive de slug post-prévente",
      candidate: "celine-marty-decouvrir-gorz",
      resolution: "celine-marty-decouvrir-gorz",
    };

    const result = matchProducts([b], [p], [arbitrage]);

    expect(result.matched).toEqual([{ book: b, product: p }]);
    expect(result.pendingArbitrage).toEqual([]);
    expect(result.orphans).toEqual([]);
  });

  it("signale une résolution invalide (slug qui ne correspond à aucun produit courant) sans rien écrire", () => {
    const b = book({ id: 10, slug: "decouvrir-gorz", boutiqueUrl: null });
    const arbitrage: ArbitrageEntry = {
      category: "lien-casse",
      bookSlug: "decouvrir-gorz",
      brokenSlug: "celine-marty-decouvrir-gorz-prevente",
      note: "test",
      candidate: null,
      resolution: "slug-qui-nexiste-plus",
    };

    const result = matchProducts([b], [], [arbitrage]);

    expect(result.matched).toEqual([]);
    expect(result.invalidResolutions).toEqual([arbitrage]);
  });

  it("détecte un conflit a posteriori (deux fiches, même produit) sans table d'arbitrage — garde-fou, rien n'est écrit", () => {
    const p = product({ id: 1, slug: "stephane-haber-decouvrir-victor-hugo", name: "Découvrir Victor Hugo" });
    const b1 = book({
      id: 47,
      slug: "decouvrir-victor-hugo",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/stephane-haber-decouvrir-victor-hugo/",
    });
    const b2 = book({
      id: 284,
      slug: "decouvrir-le-programme-du-cnr",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/stephane-haber-decouvrir-victor-hugo/",
    });

    const result = matchProducts([b1, b2], [p], []);

    expect(result.matched).toEqual([]);
    expect(result.unexpectedDuplicates).toEqual([
      { productSlug: "stephane-haber-decouvrir-victor-hugo", bookSlugs: ["decouvrir-victor-hugo", "decouvrir-le-programme-du-cnr"] },
    ]);
    // Le produit disputé n'est pas non plus auto-créé en orphelin.
    expect(result.orphans).toEqual([]);
  });

  it("laisse orphelins les produits jamais réclamés ni référencés par un arbitrage", () => {
    const claimed = product({ id: 1, slug: "decouvrir-gorz", name: "Découvrir Gorz" });
    const unclaimed = product({ id: 2, slug: "tote-bag", name: "Tote bag" });
    const b = book({
      id: 10,
      slug: "decouvrir-gorz",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/decouvrir-gorz/",
    });

    const result = matchProducts([b], [claimed, unclaimed], []);

    expect(result.matched).toEqual([{ book: b, product: claimed }]);
    expect(result.orphans).toEqual([unclaimed]);
  });
});

describe("cleanProductTitle", () => {
  it("retire les balises HTML et décode les entités", () => {
    expect(
      cleanProductTitle(
        "Friedrich Engels, <i>Ludwig Feuerbach et la fin de la philosophie allemande classique </i>",
      ),
    ).toBe("Friedrich Engels, Ludwig Feuerbach et la fin de la philosophie allemande classique");
  });

  it("décode les entités numériques et nommées (tiret, apostrophe typographique)", () => {
    expect(cleanProductTitle("Correspondance tome 5 (1857-1859) &#8211; couverture rigide")).toBe(
      "Correspondance tome 5 (1857-1859) – couverture rigide",
    );
    expect(cleanProductTitle("Je lis, j&rsquo;écris")).toBe("Je lis, j’écris");
  });

  it("réduit les espaces multiples issus du retrait des balises", () => {
    expect(cleanProductTitle("Lucien Sève,  Structuralisme et dialectique  ")).toBe(
      "Lucien Sève, Structuralisme et dialectique",
    );
  });
});

describe("matchedBookUpdate", () => {
  it("expose le prix TTC (Store API, unités mineures) et sellable=true", () => {
    const p = product({ id: 1, slug: "x", name: "X", prices: { price: "1800", currency_minor_unit: 2 } });
    expect(matchedBookUpdate(p)).toEqual({ prix: 18, sellable: true });
  });

  it("renvoie prix=null si la Store API ne fournit pas de prix exploitable", () => {
    const p = product({ id: 1, slug: "x", name: "X", prices: undefined });
    expect(matchedBookUpdate(p).prix).toBeNull();
  });
});

describe("orphanBookData", () => {
  it("construit une fiche origin:boutique minimale, sans presentation (ajoutée par l'orchestrateur)", () => {
    const p = product({
      id: 1,
      slug: "je-lis-jecris-manuelcahier-dexercices-cp",
      name: "Je lis, j&rsquo;écris (manuel+cahier d&rsquo;exercices) &#8211; CP",
    });

    expect(orphanBookData(p)).toEqual({
      title: "Je lis, j’écris (manuel+cahier d’exercices) – CP",
      slug: "je-lis-jecris-manuelcahier-dexercices-cp",
      edition: null,
      origin: "boutique",
      isbn: null,
      prix: 15,
      dateParution: ORPHAN_DATE_PARUTION,
      sortDate: ORPHAN_DATE_PARUTION,
      aParaitre: false,
      authors: [],
      collection: null,
      coverFallbackUrl: "https://boutique.editionssociales.fr/je-lis-jecris-manuelcahier-dexercices-cp.jpg",
      commerce: { sellable: true },
    });
  });

  it("dateParution est une sentinelle stable, indépendante de l'horloge (idempotence)", () => {
    const p = product({ id: 1, slug: "x", name: "X" });
    expect(orphanBookData(p).dateParution).toBe("2000-01-01T00:00:00.000Z");
    expect(orphanBookData(p).dateParution).toBe(orphanBookData(p).dateParution);
  });

  it("coverFallbackUrl est null si le produit n'a aucune image", () => {
    const p = product({ id: 1, slug: "x", name: "X", images: [] });
    expect(orphanBookData(p).coverFallbackUrl).toBeNull();
  });
});

describe("buildProductRedirectTable", () => {
  it("apparié : clé = slug produit courant, destination = édition/slug de la fiche", () => {
    const p = product({ id: 1, slug: "decouvrir-gorz", name: "Découvrir Gorz" });
    const b = book({
      id: 10,
      slug: "decouvrir-gorz",
      edition: "la-dispute",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/decouvrir-gorz/",
    });
    const match = matchProducts([b], [p], []);

    expect(buildProductRedirectTable(match, [])).toEqual({
      "decouvrir-gorz": { edition: "la-dispute", slug: "decouvrir-gorz" },
    });
  });

  it("orphelin : clé = slug produit, destination edition:null (page /boutique/<slug> native)", () => {
    const p = product({ id: 2, slug: "tote-bag", name: "Tote bag" });
    const match = matchProducts([], [p], []);

    expect(buildProductRedirectTable(match, [])).toEqual({
      "tote-bag": { edition: null, slug: "tote-bag" },
    });
  });

  it("lien cassé arbitré résolu : ajoute un alias sur le slug ORIGINAL (brokenSlug), même destination", () => {
    const p = product({ id: 1, slug: "celine-marty-decouvrir-gorz", name: "Découvrir Gorz" });
    const b = book({
      id: 10,
      slug: "decouvrir-gorz",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/celine-marty-decouvrir-gorz-prevente/",
    });
    const arbitrage: ArbitrageEntry = {
      category: "lien-casse",
      bookSlug: "decouvrir-gorz",
      brokenSlug: "celine-marty-decouvrir-gorz-prevente",
      note: "dérive de slug post-prévente",
      candidate: "celine-marty-decouvrir-gorz",
      resolution: "celine-marty-decouvrir-gorz",
    };
    const match = matchProducts([b], [p], [arbitrage]);

    expect(buildProductRedirectTable(match, [arbitrage])).toEqual({
      "celine-marty-decouvrir-gorz": { edition: "editions-sociales", slug: "decouvrir-gorz" },
      "celine-marty-decouvrir-gorz-prevente": { edition: "editions-sociales", slug: "decouvrir-gorz" },
    });
  });

  it("deux arbitrages qui partagent par erreur le même brokenSlug : le premier de la table gagne, jamais écrasé", () => {
    const p1 = product({ id: 1, slug: "produit-a", name: "Produit A" });
    const p2 = product({ id: 2, slug: "produit-b", name: "Produit B" });
    const b1 = book({ id: 10, slug: "fiche-a", boutiqueUrl: null });
    const b2 = book({ id: 11, slug: "fiche-b", boutiqueUrl: null });
    const arbitrageA: ArbitrageEntry = {
      category: "lien-casse",
      bookSlug: "fiche-a",
      brokenSlug: "slug-mort-partage",
      note: "premier",
      candidate: "produit-a",
      resolution: "produit-a",
    };
    // Saisie humaine dupliquée par erreur : même brokenSlug, autre fiche/produit.
    const arbitrageB: ArbitrageEntry = {
      category: "lien-casse",
      bookSlug: "fiche-b",
      brokenSlug: "slug-mort-partage",
      note: "doublon accidentel",
      candidate: "produit-b",
      resolution: "produit-b",
    };
    const arbitrages = [arbitrageA, arbitrageB];
    const match = matchProducts([b1, b2], [p1, p2], arbitrages);

    const table = buildProductRedirectTable(match, arbitrages);
    // Premier arbitrage rencontré dans la table (ordre stable) : jamais écrasé
    // par le second, même résolu vers une destination différente.
    expect(table["slug-mort-partage"]).toEqual({ edition: "editions-sociales", slug: "fiche-a" });
  });

  it("un TODO encore ouvert (resolution:null) ou une résolution invalide ne produit aucune entrée", () => {
    const arbitragePending: ArbitrageEntry = {
      category: "lien-casse",
      bookSlug: "fiche-a",
      brokenSlug: "slug-mort-a",
      note: "test",
      candidate: null,
      resolution: null,
    };
    const arbitrageInvalid: ArbitrageEntry = {
      category: "lien-casse",
      bookSlug: "fiche-b",
      brokenSlug: "slug-mort-b",
      note: "test",
      candidate: null,
      resolution: "slug-qui-nexiste-plus",
    };
    const b1 = book({ id: 1, slug: "fiche-a", boutiqueUrl: null });
    const b2 = book({ id: 2, slug: "fiche-b", boutiqueUrl: null });
    const match = matchProducts([b1, b2], [], [arbitragePending, arbitrageInvalid]);

    expect(buildProductRedirectTable(match, [arbitragePending, arbitrageInvalid])).toEqual({});
  });

  it("un conflit inattendu (garde-fou) ne produit aucune entrée pour le produit disputé", () => {
    const p = product({ id: 1, slug: "stephane-haber-decouvrir-victor-hugo", name: "Découvrir Victor Hugo" });
    const b1 = book({
      id: 47,
      slug: "decouvrir-victor-hugo",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/stephane-haber-decouvrir-victor-hugo/",
    });
    const b2 = book({
      id: 284,
      slug: "decouvrir-le-programme-du-cnr",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/stephane-haber-decouvrir-victor-hugo/",
    });
    const match = matchProducts([b1, b2], [p], []);

    expect(buildProductRedirectTable(match, [])).toEqual({});
  });
});
