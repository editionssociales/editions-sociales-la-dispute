import { describe, expect, it } from "vitest";
import {
  buildProductRedirectTable,
  diffTables,
  matchProducts,
  slugFromBoutiqueLink,
  type ArbitrageEntry,
  type BookRef,
} from "./build-product-redirects-core.ts";

function book(overrides: Partial<BookRef> & { id: number; slug: string }): BookRef {
  return {
    edition: "editions-sociales",
    origin: "catalogue",
    boutiqueUrl: null,
    ...overrides,
  };
}

function arbitrage(overrides: Partial<ArbitrageEntry> & { bookSlug: string; brokenSlug: string }): ArbitrageEntry {
  return {
    category: "lien-casse",
    note: "test",
    candidate: null,
    resolution: null,
    ...overrides,
  };
}

describe("slugFromBoutiqueLink", () => {
  it("extrait le segment produit, avec ou sans slash final", () => {
    expect(slugFromBoutiqueLink("https://boutique.editionssociales.fr/produit/decouvrir-gorz/")).toBe(
      "decouvrir-gorz",
    );
    expect(slugFromBoutiqueLink("https://boutique.editionssociales.fr/produit/decouvrir-gorz")).toBe(
      "decouvrir-gorz",
    );
  });

  it("décode les liens URL-encodés et rend null hors motif /produit/", () => {
    expect(slugFromBoutiqueLink("https://boutique.editionssociales.fr/produit/d%C3%A9couvrir/")).toBe("découvrir");
    expect(slugFromBoutiqueLink("https://boutique.editionssociales.fr/panier/")).toBeNull();
    expect(slugFromBoutiqueLink(null)).toBeNull();
  });
});

describe("matchProducts (inventaire gelé)", () => {
  it("apparie une fiche à sa clé d'inventaire par le slug extrait de buy.boutiqueUrl", () => {
    const b = book({
      id: 10,
      slug: "decouvrir-gorz",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/decouvrir-gorz/",
    });

    const result = matchProducts([b], ["decouvrir-gorz"], []);

    expect(result.matched).toEqual([{ productSlug: "decouvrir-gorz", book: b }]);
    expect(result.linksOutsideInventory).toEqual([]);
  });

  it("retrouve une clé d'inventaire percent-encodée depuis le lien décodé — l'entrée garde la clé verbatim", () => {
    const b = book({
      id: 10,
      slug: "de-lindocilite",
      edition: "la-dispute",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/apprenti%c2%b7e%c2%b7s/",
    });

    const result = matchProducts([b], ["apprenti%c2%b7e%c2%b7s"], []);

    expect(result.matched).toEqual([{ productSlug: "apprenti%c2%b7e%c2%b7s", book: b }]);
    expect(buildProductRedirectTable(result, [])).toEqual({
      "apprenti%c2%b7e%c2%b7s": { edition: "la-dispute", slug: "de-lindocilite" },
    });
  });

  it("un lien hors inventaire ne produit aucune entrée — rapporté seul (la boutique n'a jamais servi cette URL)", () => {
    const b = book({
      id: 10,
      slug: "une-fiche",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/jamais-vu/",
    });

    const result = matchProducts([b], ["autre-cle"], []);

    expect(result.matched).toEqual([]);
    expect(result.linksOutsideInventory).toEqual([{ bookSlug: "une-fiche", productSlug: "jamais-vu" }]);
  });

  it("une fiche couverte par un arbitrage sans résolution reste en attente — la clé candidate est réservée, jamais orpheline", () => {
    const b = book({
      id: 10,
      slug: "decouvrir-gorz",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/celine-marty-decouvrir-gorz-prevente/",
    });
    const fantome = book({ id: 11, slug: "celine-marty-decouvrir-gorz", edition: null, origin: "boutique" });
    const a = arbitrage({
      bookSlug: "decouvrir-gorz",
      brokenSlug: "celine-marty-decouvrir-gorz-prevente",
      candidate: "celine-marty-decouvrir-gorz",
    });

    const result = matchProducts([b, fantome], ["celine-marty-decouvrir-gorz"], [a]);

    expect(result.matched).toEqual([]);
    expect(result.pendingArbitrage).toEqual([a]);
    expect(result.orphans).toEqual([]);
  });

  it("un arbitrage résolu apparie la fiche sur la résolution, jamais sur son lien mort", () => {
    const b = book({
      id: 10,
      slug: "decouvrir-gorz",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/celine-marty-decouvrir-gorz-prevente/",
    });
    const a = arbitrage({
      bookSlug: "decouvrir-gorz",
      brokenSlug: "celine-marty-decouvrir-gorz-prevente",
      resolution: "celine-marty-decouvrir-gorz",
    });

    const result = matchProducts([b], ["celine-marty-decouvrir-gorz"], [a]);

    expect(result.matched).toEqual([{ productSlug: "celine-marty-decouvrir-gorz", book: b }]);
  });

  it("une résolution hors inventaire est invalide — rapportée, aucune entrée", () => {
    const b = book({ id: 10, slug: "decouvrir-gorz" });
    const a = arbitrage({ bookSlug: "decouvrir-gorz", brokenSlug: "peu-importe", resolution: "slug-disparu" });

    const result = matchProducts([b], ["autre-cle"], [a]);

    expect(result.matched).toEqual([]);
    expect(result.invalidResolutions).toEqual([a]);
  });

  it("deux fiches sur la même clé sans arbitrage : conflit rapporté, aucune entrée (défaut conservateur)", () => {
    const url = "https://boutique.editionssociales.fr/produit/le-capital/";
    const b1 = book({ id: 10, slug: "le-capital-2016", boutiqueUrl: url });
    const b2 = book({ id: 11, slug: "le-capital-2022", boutiqueUrl: url });

    const result = matchProducts([b1, b2], ["le-capital"], []);

    expect(result.matched).toEqual([]);
    expect(result.unexpectedDuplicates).toEqual([
      { productSlug: "le-capital", bookSlugs: ["le-capital-2016", "le-capital-2022"] },
    ]);
  });

  it("une clé jamais réclamée n'est orpheline que portée par une fiche boutique homonyme ; hors inventaire, la fiche est rapportée seule", () => {
    const sac = book({ id: 10, slug: "sac-en-toile", edition: null, origin: "boutique" });
    const nouveau = book({ id: 11, slug: "mug-post-coupure", edition: null, origin: "boutique" });

    const result = matchProducts([sac, nouveau], ["sac-en-toile", "cle-sans-fiche"], []);

    expect(result.orphans).toEqual([{ productSlug: "sac-en-toile", book: sac }]);
    expect(result.boutiqueOutsideInventory).toEqual(["mug-post-coupure"]);
  });
});

describe("buildProductRedirectTable", () => {
  it("pose les entrées appariées, l'alias du lien mort arbitré et les orphelines edition: null", () => {
    const gorz = book({
      id: 10,
      slug: "decouvrir-gorz",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/celine-marty-decouvrir-gorz-prevente/",
    });
    const sac = book({ id: 11, slug: "sac-en-toile", edition: null, origin: "boutique" });
    const a = arbitrage({
      bookSlug: "decouvrir-gorz",
      brokenSlug: "celine-marty-decouvrir-gorz-prevente",
      resolution: "celine-marty-decouvrir-gorz",
    });

    const match = matchProducts([gorz, sac], ["celine-marty-decouvrir-gorz", "sac-en-toile"], [a]);
    const table = buildProductRedirectTable(match, [a]);

    expect(table).toEqual({
      "celine-marty-decouvrir-gorz": { edition: "editions-sociales", slug: "decouvrir-gorz" },
      "celine-marty-decouvrir-gorz-prevente": { edition: "editions-sociales", slug: "decouvrir-gorz" },
      "sac-en-toile": { edition: null, slug: "sac-en-toile" },
    });
  });

  it("un alias n'écrase jamais une entrée déjà posée par une vraie clé homonyme (double réclamation)", () => {
    const hugo = book({
      id: 10,
      slug: "decouvrir-victor-hugo",
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/stephane-haber-decouvrir-victor-hugo/",
    });
    const cnr = book({ id: 11, slug: "decouvrir-le-programme-du-cnr" });
    const arbHugo = arbitrage({
      category: "double-reclamation",
      bookSlug: "decouvrir-victor-hugo",
      brokenSlug: "stephane-haber-decouvrir-victor-hugo",
      resolution: "stephane-haber-decouvrir-victor-hugo",
    });
    const arbCnr = arbitrage({
      category: "double-reclamation",
      bookSlug: "decouvrir-le-programme-du-cnr",
      brokenSlug: "stephane-haber-decouvrir-victor-hugo",
      resolution: "laurent-douzou-decouvrir-le-programme-du-cnr",
    });
    const inventory = ["stephane-haber-decouvrir-victor-hugo", "laurent-douzou-decouvrir-le-programme-du-cnr"];

    const match = matchProducts([hugo, cnr], inventory, [arbHugo, arbCnr]);
    const table = buildProductRedirectTable(match, [arbHugo, arbCnr]);

    expect(table["stephane-haber-decouvrir-victor-hugo"]).toEqual({
      edition: "editions-sociales",
      slug: "decouvrir-victor-hugo",
    });
    expect(table["laurent-douzou-decouvrir-le-programme-du-cnr"]).toEqual({
      edition: "editions-sociales",
      slug: "decouvrir-le-programme-du-cnr",
    });
  });
});

describe("diffTables", () => {
  it("classe les écarts en disparues / ajoutées / reciblées", () => {
    const previous = {
      stable: { edition: "editions-sociales" as const, slug: "stable" },
      perdue: { edition: null, slug: "perdue" },
      renommee: { edition: "la-dispute" as const, slug: "ancien-slug" },
    };
    const next = {
      stable: { edition: "editions-sociales" as const, slug: "stable" },
      renommee: { edition: "la-dispute" as const, slug: "nouveau-slug" },
      nouvelle: { edition: null, slug: "nouvelle" },
    };

    const diff = diffTables(previous, next);

    expect(diff.removed).toEqual([{ key: "perdue", before: { edition: null, slug: "perdue" } }]);
    expect(diff.added).toEqual([{ key: "nouvelle", after: { edition: null, slug: "nouvelle" } }]);
    expect(diff.retargeted).toEqual([
      {
        key: "renommee",
        before: { edition: "la-dispute", slug: "ancien-slug" },
        after: { edition: "la-dispute", slug: "nouveau-slug" },
      },
    ]);
  });
});
