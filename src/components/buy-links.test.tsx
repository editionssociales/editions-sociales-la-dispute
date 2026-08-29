import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Book } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { BuyLinksList } from "./buy-links";

/**
 * Verrouille le bug signalé par la cliente (`src/components/CLAUDE.md` ne le
 * documente pas encore explicitement, mais suit le même esprit que
 * `mosaic-disclosure.test.tsx`) : les liens libraires secondaires
 * (ParisLibrairies/LaLibrairie) doivent apparaître sur les CINQ statuts, y
 * compris `preorder` et le panier natif (`canAddToCart`) — les deux branches
 * qui les perdaient encore avant cette correction.
 */

// `AddToCartButton` est un composant client (`"use client"`, `add-to-cart-button.tsx`)
// qui suppose toujours `<CartProvider>` monté au-dessus (`useCart` lève sinon)
// et utilise `useFlyToCart` (portail vers `document.body`) — aucun des deux
// n'a de sens dans ce test, qui ne vérifie que la présence des liens
// secondaires AUTOUR du bouton. Mock inerte : un `<button>` qui ne fait que
// porter le `label` reçu (même défaut que le vrai composant).
vi.mock("./cart/add-to-cart-button", () => ({
  AddToCartButton: ({ label = "Ajouter au panier" }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
}));

const PARISLIBRAIRIES_URL = "https://parislibrairies.fr/un-livre";
const LALIBRAIRIE_URL = "https://lalibrairie.com/un-livre";

/** Fixture `Book` complète (interface `src/lib/types.ts:59-87`) — deux liens libraires renseignés par défaut. */
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
    buy: {
      boutique: null,
      parislibrairies: PARISLIBRAIRIES_URL,
      lalibrairie: LALIBRAIRIE_URL,
    },
    permalink: null,
    purchaseMode: "legacy-link",
    ...over,
  };
}

/** Extrait les `href` du markup rendu — même esprit regex que `button-display.test.tsx`. */
function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
}

describe("BuyLinksList — liens libraires secondaires sur tous les statuts", () => {
  it("upcoming : les deux liens secondaires sont affichés", () => {
    const markup = renderToStaticMarkup(<BuyLinksList book={book({ status: "upcoming" })} />);
    const links = hrefs(markup);
    expect(links).toContain(PARISLIBRAIRIES_URL);
    expect(links).toContain(LALIBRAIRIE_URL);
  });

  it("preorder : bouton panier natif ET les deux liens secondaires (perdus avant correction)", () => {
    const markup = renderToStaticMarkup(
      <BuyLinksList book={book({ status: "preorder", purchaseMode: "cart" })} />,
    );
    expect(markup).toContain("Précommander");
    const links = hrefs(markup);
    expect(links).toContain(PARISLIBRAIRIES_URL);
    expect(links).toContain(LALIBRAIRIE_URL);
  });

  it("unavailable : les deux liens secondaires sont affichés", () => {
    const markup = renderToStaticMarkup(<BuyLinksList book={book({ status: "unavailable" })} />);
    const links = hrefs(markup);
    expect(links).toContain(PARISLIBRAIRIES_URL);
    expect(links).toContain(LALIBRAIRIE_URL);
  });

  it("available avec panier natif (canAddToCart, LE cas majoritaire du catalogue) : bouton panier ET les deux liens secondaires (perdus avant correction)", () => {
    // `canAddToCart` (`cart-core.ts`) exige `status` `available`/`preorder`
    // ET `purchaseMode === "cart"` — les deux posés ici pour entrer dans
    // cette branche précise.
    const markup = renderToStaticMarkup(
      <BuyLinksList book={book({ status: "available", purchaseMode: "cart" })} />,
    );
    expect(markup).toContain("Ajouter au panier");
    const links = hrefs(markup);
    expect(links).toContain(PARISLIBRAIRIES_URL);
    expect(links).toContain(LALIBRAIRIE_URL);
  });

  it("external avec permalink === parislibrairies (priorité `resolveNativePurchase`) : le lien repris par le CTA principal n'est pas répété en secondaire, LaLibrairie reste affiché", () => {
    const markup = renderToStaticMarkup(
      <BuyLinksList
        book={book({
          status: "external",
          purchaseMode: "legacy-link",
          permalink: PARISLIBRAIRIES_URL,
        })}
      />,
    );
    const links = hrefs(markup);
    // Sans l'exclusion, ParisLibrairies apparaîtrait deux fois (CTA principal
    // + secondaire) : une seule occurrence attendue, celle du CTA principal.
    expect(links.filter((h) => h === PARISLIBRAIRIES_URL)).toHaveLength(1);
    expect(links).toContain(LALIBRAIRIE_URL);
  });
});

/**
 * Lot C — le prix est un FAIT du livre, affiché sur sa propre fiche quel que
 * soit le statut d'achat (demande client). Avant correction, `upcoming` et
 * `unavailable` n'affichaient PAS le prix : les deux sont donc verrouillés
 * ici comme les trois autres statuts, qui l'affichaient déjà.
 */
describe("BuyLinksList — le prix s'affiche même hors vente", () => {
  const FORMATTED_PRICE = formatPrice(20)!;

  it("upcoming : le prix formaté apparaît", () => {
    const markup = renderToStaticMarkup(<BuyLinksList book={book({ status: "upcoming" })} />);
    expect(markup).toContain(FORMATTED_PRICE);
  });

  it("preorder : le prix formaté apparaît", () => {
    const markup = renderToStaticMarkup(
      <BuyLinksList book={book({ status: "preorder", purchaseMode: "cart" })} />,
    );
    expect(markup).toContain(FORMATTED_PRICE);
  });

  it("unavailable : le prix formaté apparaît", () => {
    const markup = renderToStaticMarkup(<BuyLinksList book={book({ status: "unavailable" })} />);
    expect(markup).toContain(FORMATTED_PRICE);
  });

  it("available avec panier natif : le prix formaté apparaît", () => {
    const markup = renderToStaticMarkup(
      <BuyLinksList book={book({ status: "available", purchaseMode: "cart" })} />,
    );
    expect(markup).toContain(FORMATTED_PRICE);
  });

  it("external : le prix formaté apparaît", () => {
    const markup = renderToStaticMarkup(
      <BuyLinksList book={book({ status: "external", purchaseMode: "legacy-link" })} />,
    );
    expect(markup).toContain(FORMATTED_PRICE);
  });

  it("price null : aucun prix affiché (pas de « 0 € »)", () => {
    const markup = renderToStaticMarkup(
      <BuyLinksList book={book({ status: "unavailable", price: null })} />,
    );
    expect(markup).not.toContain("€");
  });
});
