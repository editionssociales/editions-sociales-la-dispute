import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Book } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { BookCard } from "./book-card";

/**
 * Lot C — même invariant que `buy-links.test.tsx` côté carte de grille : le
 * prix est un FAIT du livre, affiché même quand le livre n'est pas en vente
 * (`upcoming`/`unavailable`). `cover: null` évite `next/image` (fallback
 * texte de `BookCover`, `src/lib/cover.tsx`), inutile à ce test.
 */

function book(over: Partial<Book> & Pick<Book, "status">): Book {
  return {
    id: 1,
    edition: "editions-sociales",
    origin: "catalogue",
    slug: "un-livre",
    title: "Un livre",
    authors: [],
    libelles: [],
    isbn: null,
    price: 20,
    pages: null,
    publishedAt: null,
    cover: null,
    buy: { boutique: null, parislibrairies: null, lalibrairie: null },
    permalink: null,
    purchaseMode: "legacy-link",
    ...over,
  };
}

describe("BookCard — le prix s'affiche même hors vente", () => {
  const FORMATTED_PRICE = formatPrice(20)!;

  it("upcoming : le prix formaté apparaît", () => {
    const markup = renderToStaticMarkup(<BookCard book={book({ status: "upcoming" })} />);
    expect(markup).toContain(FORMATTED_PRICE);
  });

  it("unavailable : le prix formaté apparaît", () => {
    const markup = renderToStaticMarkup(<BookCard book={book({ status: "unavailable" })} />);
    expect(markup).toContain(FORMATTED_PRICE);
  });

  it("price null : aucun prix affiché (pas de « 0 € »)", () => {
    const markup = renderToStaticMarkup(
      <BookCard book={book({ status: "unavailable", price: null })} />,
    );
    expect(markup).not.toContain("€");
  });
});

/** Badge « Épuisé » vs « Indisponible » (demande client 2026-09-04) — même recette visuelle, libellé piloté par `unavailableReason`. */
describe("BookCard — badge « Épuisé » distinct d'« Indisponible »", () => {
  it("unavailableReason absent → badge « Indisponible »", () => {
    const markup = renderToStaticMarkup(<BookCard book={book({ status: "unavailable" })} />);
    expect(markup).toContain("Indisponible");
    expect(markup).not.toContain("Épuisé");
  });

  it("unavailableReason: out-of-stock → badge « Épuisé »", () => {
    const markup = renderToStaticMarkup(
      <BookCard book={book({ status: "unavailable", unavailableReason: "out-of-stock" })} />,
    );
    expect(markup).toContain("Épuisé");
  });
});

/**
 * Mention « ePub » (client 2026-09-09) — orthogonale au statut d'achat,
 * co-existe avec le badge de statut. `status: "unavailable"`/`"upcoming"`
 * (comme les autres tests de ce fichier) : `canAddToCart` reste faux, pas de
 * `AddToCartButton` rendu (ce composant exige `<CartProvider>`, absent ici —
 * même contrainte que `buy-links.test.tsx`, qui le mocke ; la mention « ePub »
 * ne dépend pas du chip panier, ce détour l'évite simplement).
 */
describe("BookCard — mention « ePub » (titre numérique seul)", () => {
  it("format numerique → badge « ePub » affiché", () => {
    const markup = renderToStaticMarkup(
      <BookCard book={book({ status: "unavailable", format: "numerique" })} />,
    );
    expect(markup).toContain("ePub");
  });

  it("format papier (défaut) → aucune mention « ePub »", () => {
    const markup = renderToStaticMarkup(<BookCard book={book({ status: "unavailable" })} />);
    expect(markup).not.toContain("ePub");
  });

  it("co-existe avec le badge de statut (précommande numérique)", () => {
    const markup = renderToStaticMarkup(
      <BookCard book={book({ status: "upcoming", format: "numerique" })} />,
    );
    expect(markup).toContain("À paraître");
    expect(markup).toContain("ePub");
  });
});
