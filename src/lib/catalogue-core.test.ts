import { describe, expect, it } from "vitest";
import {
  buildNativeBookDetail,
  buildNativeCatalogue,
  computeFacets,
  countByEdition,
  isRecentRelease,
  queryBooks,
  recentReleases,
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
  // Stock explicite (article normalement vendu) : `sellable(null)` produirait
  // désormais `unavailable` (refus `untracked`), hors sujet de ces tests
  // d'assemblage/facettes.
  rawBook({ id: 100, slug: "tote-bag", title: "Tote bag", commerce: sellable(5) }),
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

  it("recherche pliée (règle unique `search-text`, partagée avec la complétion)", () => {
    // Accents/casse/apostrophe typographique pliés (« L’Idéologie »).
    expect(queryBooks(CATALOGUE, { q: "IDEOLOGIE" }).map((b) => b.slug)).toEqual(["ideologie"]);
    // Jetons en ET, croisés entre champs : auteur + titre.
    expect(queryBooks(CATALOGUE, { q: "marx capital" }).map((b) => b.slug)).toEqual(["capital"]);
    // Le nom d'auteur seul reste couvert…
    expect(queryBooks(CATALOGUE, { q: "dorlin" }).map((b) => b.slug)).toEqual(["genre"]);
    // …et les libellés entrent dans le champ de `q` : chercher un thème
    // montre ses livres, comme la suggestion de libellé du dropdown.
    expect(
      queryBooks(CATALOGUE, { q: "geme" })
        .map((b) => b.slug)
        .sort(),
    ).toEqual(["capital", "ideologie"]);
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

  it("stock `null` sur une fiche parue → indisponible (refus `untracked`, décision client 2026-09-04)", () => {
    const book = rawBook({ id: 2, slug: "capital", title: "Le Capital" });
    const resolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      sellable(null),
      "/catalogue/editions-sociales/capital",
    );
    expect(resolved).toEqual({
      status: "unavailable",
      permalink: null,
      purchaseMode: "legacy-link",
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

  it("mapping front épuisé vs indisponible : `unavailableReason` posé UNIQUEMENT pour le refus `out-of-stock`", () => {
    const book = rawBook({ id: 30, slug: "epuise-reason", title: "Épuisé (raison)" });
    const outOfStock = resolveNativePurchase(
      toBook("editions-sociales", book),
      sellable(0),
      "/catalogue/editions-sociales/epuise-reason",
    );
    expect(outOfStock.status).toBe("unavailable");
    expect(outOfStock.unavailableReason).toBe("out-of-stock");

    const untracked = resolveNativePurchase(
      toBook("editions-sociales", book),
      sellable(null),
      "/catalogue/editions-sociales/epuise-reason",
    );
    expect(untracked.status).toBe("unavailable");
    expect(untracked.unavailableReason).toBeUndefined();

    const notSellableResolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      notSellable,
      "/catalogue/editions-sociales/epuise-reason",
    );
    expect(notSellableResolved.status).toBe("unavailable");
    expect(notSellableResolved.unavailableReason).toBeUndefined();
  });

  it("épuisé MAIS lien libraire externe → reste `external`, jamais `unavailableReason` (précédence inchangée)", () => {
    const book = rawBook({
      id: 31,
      slug: "epuise-external",
      title: "Épuisé chez un libraire",
      buy: { boutique: null, parislibrairies: "https://parislibrairies.fr/epuise-external", lalibrairie: null },
    });
    const resolved = resolveNativePurchase(
      toBook("editions-sociales", book),
      sellable(0),
      "/catalogue/editions-sociales/epuise-external",
    );
    expect(resolved.status).toBe("external");
    expect(resolved).not.toHaveProperty("unavailableReason");
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
    expect(resolved).toEqual({
      status: "unavailable",
      permalink: null,
      purchaseMode: "legacy-link",
      unavailableReason: "out-of-stock",
    });
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

  describe("précommande (`commerce.preorder`, client 2026-08-20)", () => {
    const preorderable = (stock: number | null): CommerceInfo => ({
      sellable: true,
      stock,
      preorder: true,
    });

    it("à paraître + preorder coché + vendable + stock ok → statut `preorder`, panier natif", () => {
      const book = rawBook({ id: 8, slug: "a-paraitre-precoco", title: "À paraître", publishedAt: "2999-01-01" });
      const resolved = resolveNativePurchase(
        toBook("editions-sociales", book),
        preorderable(5),
        "/catalogue/editions-sociales/a-paraitre-precoco",
      );
      expect(resolved).toEqual({
        status: "preorder",
        permalink: "/catalogue/editions-sociales/a-paraitre-precoco",
        purchaseMode: "cart",
      });
    });

    it("à paraître + preorder coché MAIS non vendable → refus comme n'importe quelle fiche (pas de contournement)", () => {
      const book = rawBook({ id: 9, slug: "precoco-decochee", title: "Précommande décochée", publishedAt: "2999-01-01" });
      const resolved = resolveNativePurchase(
        toBook("editions-sociales", book),
        { sellable: false, stock: 5, preorder: true },
        "/catalogue/editions-sociales/precoco-decochee",
      );
      expect(resolved.status).toBe("unavailable");
    });

    it("à paraître + preorder coché MAIS épuisé → `unavailable`, jamais `preorder`", () => {
      const book = rawBook({ id: 10, slug: "precoco-epuisee", title: "Précommande épuisée", publishedAt: "2999-01-01" });
      const resolved = resolveNativePurchase(
        toBook("editions-sociales", book),
        preorderable(0),
        "/catalogue/editions-sociales/precoco-epuisee",
      );
      expect(resolved.status).toBe("unavailable");
    });

    it("à paraître SANS preorder coché → `upcoming` inchangé (comportement historique)", () => {
      const book = rawBook({ id: 11, slug: "a-paraitre-simple", title: "À paraître simple", publishedAt: "2999-01-01" });
      const resolved = resolveNativePurchase(
        toBook("editions-sociales", book),
        sellable(5),
        "/catalogue/editions-sociales/a-paraitre-simple",
      );
      expect(resolved.status).toBe("upcoming");
    });

    it("parution PASSÉE + preorder coché → `available` (le drapeau n'a d'effet que sur une fiche à paraître)", () => {
      const book = rawBook({ id: 12, slug: "deja-paru", title: "Déjà paru" });
      const resolved = resolveNativePurchase(
        toBook("editions-sociales", book),
        preorderable(5),
        "/catalogue/editions-sociales/deja-paru",
      );
      expect(resolved.status).toBe("available");
    });
  });
});

describe("queryBooks — filtre « à paraître » inclut les précommandes ouvertes", () => {
  it("un livre `preorder` reste dans la vue « à paraître » (découverte par date, pas par achat)", () => {
    const preorderRaw = rawBook({
      id: 50,
      slug: "precommande-visible",
      title: "Précommande visible",
      publishedAt: "2999-01-01",
      commerce: { sellable: true, stock: 5, preorder: true },
    });
    const catalogue = buildNativeCatalogue({ "editions-sociales": [...ES_BOOKS, preorderRaw] });
    const upcomingOnly = queryBooks(catalogue, { upcoming: true }).map((b) => b.slug);
    expect(upcomingOnly).toContain("avenir"); // upcoming classique
    expect(upcomingOnly).toContain("precommande-visible"); // preorder — toujours « à paraître »
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
      rawBook({ id: 100, slug: "tote-bag", title: "Tote bag", commerce: sellable(5) }),
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
    const raw = rawBook({ id: 100, slug: "tote-bag", title: "Tote bag", commerce: sellable(5) });
    const detail = buildNativeBookDetail(null, raw, "/boutique/tote-bag", "boutique");
    expect(detail.edition).toBeNull();
    expect(detail.origin).toBe("boutique");
    expect(detail.status).toBe("available");
  });
});

/* -------- nouveautés accueil (fenêtre 3 mois, retour client 2026-08-29) -------- */

describe("isRecentRelease — fenêtre mois civil Paris courant + 2 précédents", () => {
  // En septembre 2026 : fenêtre = juillet + août + septembre.
  const now = new Date("2026-09-15T10:00:00Z");

  it("1er juillet (borne basse) → inclus", () => {
    expect(isRecentRelease("2026-07-01", now)).toBe(true);
  });

  it("30 juin (juste avant la borne) → exclu", () => {
    expect(isRecentRelease("2026-06-30", now)).toBe(false);
  });

  it("mi-septembre (mois courant) → inclus", () => {
    expect(isRecentRelease("2026-09-10", now)).toBe(true);
  });

  it("à-paraître exclu même si sa date tombe dans le mois courant", () => {
    expect(isRecentRelease("2026-09-20", now)).toBe(false);
  });

  it("publishedAt null → exclu", () => {
    expect(isRecentRelease(null, now)).toBe(false);
  });
});

describe("recentReleases — vitrine accueil, plancher jamais vide", () => {
  const now = new Date("2026-09-15T10:00:00Z");

  const book = (id: number, publishedAt: string | null) =>
    toBook(
      "editions-sociales",
      rawBook({ id, slug: `nouveaute-${id}`, title: `Nouveauté ${id}`, publishedAt }),
    );

  it("fenêtre riche (≥ 6) : strictement les livres de la fenêtre, rien hors fenêtre", () => {
    const books = [
      book(1, "2026-09-10"),
      book(2, "2026-08-15"),
      book(3, "2026-07-05"),
      book(4, "2026-07-01"),
      book(5, "2026-08-01"),
      book(6, "2026-09-01"),
      book(7, "2026-01-01"), // hors fenêtre — ne doit jamais apparaître
    ];
    const result = recentReleases(books, 12, now);
    expect(result.map((b) => b.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("fenêtre pauvre : complète au plancher (6) avec des parutions plus anciennes, jamais un à-paraître", () => {
    const books = [
      book(1, "2026-09-01"), // seul livre dans la fenêtre
      book(2, "2026-01-01"),
      book(3, "2025-12-01"),
      book(4, "2025-11-01"),
      book(5, "2025-10-01"),
      book(6, "2025-09-01"),
      book(99, "2099-01-01"), // à-paraître : jamais réintroduit, même pour compléter le plancher
    ];
    const result = recentReleases(books, 12, now);
    expect(result).toHaveLength(6);
    expect(result.map((b) => b.id)).toContain(1);
    expect(result.map((b) => b.id)).not.toContain(99);
  });

  it("respecte `limit` même quand la fenêtre en fournirait davantage", () => {
    const books = [book(1, "2026-09-01"), book(2, "2026-08-01"), book(3, "2026-07-01")];
    expect(recentReleases(books, 2, now)).toHaveLength(2);
  });
});
