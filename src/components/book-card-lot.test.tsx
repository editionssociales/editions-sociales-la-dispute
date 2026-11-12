import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Book } from "@/lib/types";
import { BookCard } from "./book-card";

// `AddToCartButton` est un composant client branché sur le contexte panier —
// hors sujet ici : on ne vérifie que QUELLES puces la carte pose, avec quelle
// quantité.
vi.mock("./cart/add-to-cart-button", () => ({
  AddToCartButton: ({ qty = 1 }: { qty?: number }) => <button type="button">{`puce×${qty}`}</button>,
}));

function book(over: Partial<Book>): Book {
  return {
    id: 1,
    edition: "editions-sociales",
    origin: "catalogue",
    slug: "avenir-en-commun",
    title: "L'Avenir en commun",
    authors: [],
    libelles: [],
    isbn: null,
    price: 5,
    pages: null,
    publishedAt: null,
    cover: null,
    buy: { boutique: null, parislibrairies: null, lalibrairie: null },
    permalink: "/catalogue/editions-sociales/avenir-en-commun",
    status: "available",
    purchaseMode: "cart",
    ...over,
  };
}

describe("BookCard — titre vendu par lot (`Book.lot`)", () => {
  it("une SEULE puce, qui ajoute un lot de 10 — jamais d'achat à l'unité", () => {
    const markup = renderToStaticMarkup(<BookCard book={book({ lot: true })} />);
    expect(markup).toContain("puce×10");
    expect(markup).not.toContain("puce×1<");
  });

  it("affiche le prix du LOT (10 × le prix unitaire), avec sa mention", () => {
    const markup = renderToStaticMarkup(<BookCard book={book({ lot: true, price: 5 })} />);
    expect(markup).toContain("50,00");
    expect(markup.replace(/<!-- -->/g, "")).toContain("les 10");
    expect(markup).not.toContain(">5,00");
  });

  it("sans le drapeau : la seule puce d'achat à l'unité", () => {
    const markup = renderToStaticMarkup(<BookCard book={book({})} />);
    expect(markup).not.toContain("puce×10");
    expect(markup).toContain("puce×1<");
  });

  it("titre indisponible : aucune puce, même coché « vendu par lot »", () => {
    const markup = renderToStaticMarkup(
      <BookCard book={book({ lot: true, status: "unavailable", purchaseMode: "legacy-link" })} />,
    );
    expect(markup).not.toContain("puce×");
  });
});
