import { describe, expect, it } from "vitest";
import { BOOK_HOVER_EXCERPT_MAX, isUsefulBookHoverCardData, toBookHoverCardData } from "./book-hover-card-data";
import { buildNativeBookDetail } from "./catalogue-core";
import type { RawBook } from "./catalogue-source";
import { cmsExcerpt } from "./cms-html";
import { formatPrice } from "./format";

/**
 * `toBookHoverCardData` est le builder général (catalogue) du DTO de
 * `BookHoverCard` — le second fabricant (`contreparties.ts`, sa propre
 * lecture Payload brute) n'est pas testé unitairement, même convention que
 * le reste de `contreparties.ts` (cf. `src/lib/CLAUDE.md`).
 *
 * Fixtures : `buildNativeBookDetail` (déjà testé, `catalogue-core.test.ts`)
 * construit un `BookDetail` réaliste depuis un `RawBook` minimal — reproduire
 * la fiche à la main dupliquerait tous ses champs obligatoires pour rien.
 */

const rawBook = (over: Partial<RawBook> & Pick<RawBook, "id" | "slug" | "title">): RawBook => ({
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

describe("toBookHoverCardData", () => {
  it("auteurs joints, libellés en noms, prix formaté, extrait tronqué, couverture", () => {
    const detail = buildNativeBookDetail(
      "editions-sociales",
      rawBook({
        id: 1,
        slug: "capital",
        title: "Le Capital",
        authors: [
          { name: "Karl Marx", slug: "marx" },
          { name: "Friedrich Engels", slug: "engels" },
        ],
        libelles: [{ name: "GEME", slug: "geme" }, { name: "Économie", slug: "eco" }],
        price: 12.5,
        cover: { url: "https://blob.test/capital.jpg", width: 400, height: 600 },
        presentationHtml: "<p>Une critique de l'économie politique, ouvrage majeur du marxisme.</p>",
      }),
      "/catalogue/editions-sociales/capital",
    );

    const data = toBookHoverCardData(detail);
    expect(data.title).toBe("Le Capital");
    expect(data.authors).toBe("Karl Marx, Friedrich Engels");
    expect(data.editionLabel).toBe("Les Éditions sociales");
    expect(data.libelles).toEqual(["GEME", "Économie"]);
    // Délégué à `formatPrice` (jamais réimplémenté ici) : comparaison contre
    // le même appel plutôt qu'une chaîne figée — l'espace insécable qu'`Intl`
    // insère avant « € » n'est pas un espace normal (piège de recopie).
    expect(data.priceLabel).toBe(formatPrice(12.5));
    expect(data.excerpt).toBe("Une critique de l'économie politique, ouvrage majeur du marxisme.");
    expect(data.coverUrl).toBe("https://blob.test/capital.jpg");
  });

  it("aucun auteur → null (jamais une chaîne vide)", () => {
    const detail = buildNativeBookDetail(
      "editions-sociales",
      rawBook({ id: 2, slug: "sans-auteur", title: "Sans auteur" }),
      "/catalogue/editions-sociales/sans-auteur",
    );
    expect(toBookHoverCardData(detail).authors).toBeNull();
  });

  it("article boutique-seul (edition null) → editionLabel null", () => {
    const detail = buildNativeBookDetail(
      null,
      rawBook({ id: 100, slug: "tote-bag", title: "Tote bag" }),
      "/boutique/tote-bag",
      "boutique",
    );
    expect(toBookHoverCardData(detail).editionLabel).toBeNull();
  });

  it("pas de prix ni de couverture → priceLabel/coverUrl null", () => {
    const detail = buildNativeBookDetail(
      "la-dispute",
      rawBook({ id: 3, slug: "sans-prix", title: "Sans prix" }),
      "/catalogue/la-dispute/sans-prix",
    );
    const data = toBookHoverCardData(detail);
    expect(data.priceLabel).toBeNull();
    expect(data.coverUrl).toBeNull();
  });

  it("présentation vide → excerpt null", () => {
    const detail = buildNativeBookDetail(
      "la-dispute",
      rawBook({ id: 4, slug: "sans-presentation", title: "Sans présentation" }),
      "/catalogue/la-dispute/sans-presentation",
    );
    expect(toBookHoverCardData(detail).excerpt).toBeNull();
  });

  it("présentation longue : extrait tronqué à BOOK_HOVER_EXCERPT_MAX, jamais un mot coupé", () => {
    const longText = Array.from({ length: 60 }, (_, i) => `mot${i}`).join(" ");
    const detail = buildNativeBookDetail(
      "la-dispute",
      rawBook({
        id: 5,
        slug: "long",
        title: "Long",
        presentationHtml: `<p>${longText}</p>`,
      }),
      "/catalogue/la-dispute/long",
    );
    // La troncature au mot près (jamais un mot coupé) est le contrat de
    // `cmsExcerpt` lui-même, déjà verrouillé par `cms-html.test.ts` — ce test
    // vérifie le BRANCHEMENT : `toBookHoverCardData` l'appelle avec
    // `BOOK_HOVER_EXCERPT_MAX`, jamais une autre longueur.
    expect(toBookHoverCardData(detail).excerpt).toBe(cmsExcerpt(detail.presentation, BOOK_HOVER_EXCERPT_MAX));
    expect(toBookHoverCardData(detail).excerpt!.length).toBeLessThan(longText.length);
  });
});

describe("isUsefulBookHoverCardData", () => {
  it("vrai dès qu'un prix, un extrait OU des auteurs sont présents", () => {
    expect(isUsefulBookHoverCardData({ priceLabel: "12,50 €", excerpt: null, authors: null })).toBe(true);
    expect(isUsefulBookHoverCardData({ priceLabel: null, excerpt: "Un extrait.", authors: null })).toBe(true);
    expect(isUsefulBookHoverCardData({ priceLabel: null, excerpt: null, authors: "Karl Marx" })).toBe(true);
  });

  it("faux si les trois sont absents — le titre nu suffit, jamais une carte vide", () => {
    expect(isUsefulBookHoverCardData({ priceLabel: null, excerpt: null, authors: null })).toBe(false);
  });
});
