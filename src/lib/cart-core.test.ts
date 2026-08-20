import { describe, expect, it } from "vitest";
import {
  addToCart,
  canAddToCart,
  cartCount,
  CART_VERSION,
  clearCart,
  computeCartTotals,
  EMPTY_CART,
  MAX_LINE_QTY,
  parseCartState,
  pickBooksByIds,
  removeFromCart,
  resolveCartSummary,
  serializeCartState,
  setLineQty,
  type CartState,
} from "./cart-core";
import type { Book } from "./types";

/* -------- fixtures -------- */

const book = (over: Partial<Book> & Pick<Book, "id" | "slug" | "title">): Book => ({
  edition: "editions-sociales",
  origin: "catalogue",
  authors: [],
  libelles: [],
  isbn: null,
  price: 20,
  pages: null,
  publishedAt: null,
  cover: null,
  buy: { boutique: null, parislibrairies: null, lalibrairie: null },
  status: "available",
  permalink: "/catalogue/editions-sociales/x",
  purchaseMode: "cart",
  ...over,
});

/* --------------------------------- reducer --------------------------------- */

describe("addToCart", () => {
  it("ajoute une nouvelle ligne à quantité 1 par défaut", () => {
    const next = addToCart(EMPTY_CART, 42);
    expect(next.lines).toEqual([{ id: 42, qty: 1 }]);
  });

  it("cumule la quantité si la ligne existe déjà", () => {
    const state = addToCart(EMPTY_CART, 42, 2);
    const next = addToCart(state, 42, 3);
    expect(next.lines).toEqual([{ id: 42, qty: 5 }]);
  });

  it("plafonne à MAX_LINE_QTY même en cumulant", () => {
    const state = addToCart(EMPTY_CART, 42, MAX_LINE_QTY);
    const next = addToCart(state, 42, 100);
    expect(next.lines).toEqual([{ id: 42, qty: MAX_LINE_QTY }]);
  });

  it("ne modifie pas l'état d'origine (immutabilité)", () => {
    const next = addToCart(EMPTY_CART, 1);
    expect(EMPTY_CART.lines).toEqual([]);
    expect(next).not.toBe(EMPTY_CART);
  });
});

describe("setLineQty", () => {
  it("fixe la quantité exacte d'une ligne existante", () => {
    const state = addToCart(EMPTY_CART, 1, 2);
    const next = setLineQty(state, 1, 7);
    expect(next.lines).toEqual([{ id: 1, qty: 7 }]);
  });

  it("qty ≤ 0 retire la ligne", () => {
    const state = addToCart(EMPTY_CART, 1, 2);
    expect(setLineQty(state, 1, 0).lines).toEqual([]);
    expect(setLineQty(state, 1, -3).lines).toEqual([]);
  });

  it("plafonne à MAX_LINE_QTY", () => {
    const state = addToCart(EMPTY_CART, 1, 1);
    expect(setLineQty(state, 1, 999).lines).toEqual([{ id: 1, qty: MAX_LINE_QTY }]);
  });

  it("n'a aucun effet sur une ligne absente", () => {
    const state = addToCart(EMPTY_CART, 1, 1);
    expect(setLineQty(state, 999, 5).lines).toEqual([{ id: 1, qty: 1 }]);
  });
});

describe("removeFromCart / clearCart / cartCount", () => {
  it("retire uniquement la ligne visée", () => {
    let state = addToCart(EMPTY_CART, 1, 2);
    state = addToCart(state, 2, 3);
    expect(removeFromCart(state, 1).lines).toEqual([{ id: 2, qty: 3 }]);
  });

  it("clearCart repart d'un panier vide, version courante", () => {
    const state = addToCart(EMPTY_CART, 1, 2);
    expect(clearCart()).toEqual({ version: CART_VERSION, lines: [] });
    expect(state.lines).not.toEqual([]);
  });

  it("cartCount somme les quantités, pas le nombre de lignes", () => {
    let state = addToCart(EMPTY_CART, 1, 2);
    state = addToCart(state, 2, 5);
    expect(cartCount(state)).toBe(7);
  });

  it("cartCount d'un panier vide = 0", () => {
    expect(cartCount(EMPTY_CART)).toBe(0);
  });
});

/* ------------------------------- persistance -------------------------------- */

describe("parseCartState — désérialisation défensive (localStorage non fiable)", () => {
  it("chaîne absente/vide → panier vide", () => {
    expect(parseCartState(null)).toEqual(EMPTY_CART);
    expect(parseCartState(undefined)).toEqual(EMPTY_CART);
    expect(parseCartState("")).toEqual(EMPTY_CART);
  });

  it("JSON invalide → panier vide, ne jette jamais", () => {
    expect(parseCartState("{not json")).toEqual(EMPTY_CART);
  });

  it("valeur JSON qui n'est pas un objet → panier vide", () => {
    expect(parseCartState("42")).toEqual(EMPTY_CART);
    expect(parseCartState("null")).toEqual(EMPTY_CART);
    expect(parseCartState('"x"')).toEqual(EMPTY_CART);
  });

  it("version absente ou différente de CART_VERSION → panier vide", () => {
    expect(parseCartState(JSON.stringify({ lines: [{ id: 1, qty: 2 }] }))).toEqual(EMPTY_CART);
    expect(parseCartState(JSON.stringify({ version: 999, lines: [{ id: 1, qty: 2 }] }))).toEqual(
      EMPTY_CART,
    );
  });

  it("`lines` absent ou pas un tableau → panier vide", () => {
    expect(parseCartState(JSON.stringify({ version: CART_VERSION }))).toEqual(EMPTY_CART);
    expect(
      parseCartState(JSON.stringify({ version: CART_VERSION, lines: "oups" })),
    ).toEqual(EMPTY_CART);
  });

  it("aller-retour fidèle via serializeCartState", () => {
    const state = addToCart(addToCart(EMPTY_CART, 1, 2), 2, 3);
    expect(parseCartState(serializeCartState(state))).toEqual(state);
  });

  it("écarte silencieusement une ligne isolée corrompue (id non entier, qty non numérique)", () => {
    const raw = JSON.stringify({
      version: CART_VERSION,
      lines: [
        { id: 1, qty: 2 },
        { id: "deux", qty: 3 },
        { id: 3 },
        { id: 4, qty: "beaucoup" },
        "pas-un-objet",
        { id: -1, qty: 1 },
        { id: 1.5, qty: 1 },
      ],
    });
    expect(parseCartState(raw).lines).toEqual([{ id: 1, qty: 2 }]);
  });

  it("dédoublonne un id dupliqué (garde la première occurrence)", () => {
    const raw = JSON.stringify({
      version: CART_VERSION,
      lines: [
        { id: 1, qty: 2 },
        { id: 1, qty: 9 },
      ],
    });
    expect(parseCartState(raw).lines).toEqual([{ id: 1, qty: 2 }]);
  });

  it("qty décimale ou hors bornes est ramenée dans les clous (clampQty)", () => {
    const raw = JSON.stringify({
      version: CART_VERSION,
      lines: [
        { id: 1, qty: 2.6 },
        { id: 2, qty: 500 },
        { id: 3, qty: -5 },
      ],
    });
    expect(parseCartState(raw).lines).toEqual([
      { id: 1, qty: 3 },
      { id: 2, qty: MAX_LINE_QTY },
      { id: 3, qty: 1 },
    ]);
  });
});

/* --------------------------- éligibilité au panier --------------------------- */

describe("canAddToCart", () => {
  it("vrai ssi disponible ET mode panier", () => {
    expect(canAddToCart({ status: "available", purchaseMode: "cart" })).toBe(true);
  });

  it("faux si disponible mais lien externe (Woo/librairie, flag off ou hors panier natif)", () => {
    expect(canAddToCart({ status: "available", purchaseMode: "legacy-link" })).toBe(false);
  });

  it("faux pour external/upcoming/unavailable, quel que soit purchaseMode", () => {
    expect(canAddToCart({ status: "external", purchaseMode: "cart" })).toBe(false);
    expect(canAddToCart({ status: "upcoming", purchaseMode: "cart" })).toBe(false);
    expect(canAddToCart({ status: "unavailable", purchaseMode: "cart" })).toBe(false);
  });

  it("vrai pour `preorder` + mode panier (précommande, client 2026-08-20) — même panier natif qu'`available`", () => {
    expect(canAddToCart({ status: "preorder", purchaseMode: "cart" })).toBe(true);
  });

  it("faux pour `preorder` hors mode panier (défensif, jamais produit par resolveNativePurchase)", () => {
    expect(canAddToCart({ status: "preorder", purchaseMode: "legacy-link" })).toBe(false);
  });
});

/* ------------------------------ lignes résolues ------------------------------ */

describe("pickBooksByIds", () => {
  it("ne garde que les livres demandés, dans le catalogue fourni", () => {
    const books = [book({ id: 1, slug: "a", title: "A" }), book({ id: 2, slug: "b", title: "B" })];
    expect(pickBooksByIds(books, [2])).toEqual([books[1]]);
  });
});

describe("resolveCartSummary", () => {
  const capital = book({ id: 1, slug: "capital", title: "Le Capital", price: 20 });
  const ideologie = book({ id: 2, slug: "ideologie", title: "L'Idéologie", price: 15.5 });

  it("résout chaque ligne, calcule le sous-total (centimes) sur les lignes purchasable", () => {
    const state: CartState = { version: CART_VERSION, lines: [{ id: 1, qty: 2 }, { id: 2, qty: 1 }] };
    const summary = resolveCartSummary(state, [capital, ideologie], new Map());
    expect(summary.lines).toHaveLength(2);
    expect(summary.lines[0]).toMatchObject({ id: 1, qty: 2, unitPriceCents: 2000, lineTotalCents: 4000 });
    expect(summary.lines[1]).toMatchObject({ id: 2, qty: 1, unitPriceCents: 1550, lineTotalCents: 1550 });
    expect(summary.subtotalCents).toBe(5550);
    expect(summary.missingIds).toEqual([]);
  });

  it("un id introuvable dans l'instantané part dans missingIds, absent des lignes", () => {
    const state: CartState = { version: CART_VERSION, lines: [{ id: 999, qty: 1 }] };
    const summary = resolveCartSummary(state, [capital], new Map());
    expect(summary.lines).toEqual([]);
    expect(summary.missingIds).toEqual([999]);
    expect(summary.subtotalCents).toBe(0);
  });

  it("une ligne devenue non achetable (rupture/dépubliée) reste affichée mais exclue du sous-total", () => {
    const epuise = book({ id: 3, slug: "epuise", title: "Épuisé", status: "unavailable", purchaseMode: "legacy-link" });
    const state: CartState = { version: CART_VERSION, lines: [{ id: 3, qty: 2 }] };
    const summary = resolveCartSummary(state, [epuise], new Map());
    expect(summary.lines[0].purchasable).toBe(false);
    expect(summary.lines[0].lineTotalCents).toBe(0);
    expect(summary.subtotalCents).toBe(0);
  });

  it("prix inconnu (null) → non purchasable, jamais de total inventé", () => {
    const sansPrix = book({ id: 4, slug: "sans-prix", title: "Sans prix", price: null });
    const state: CartState = { version: CART_VERSION, lines: [{ id: 4, qty: 1 }] };
    const summary = resolveCartSummary(state, [sansPrix], new Map());
    expect(summary.lines[0].purchasable).toBe(false);
    expect(summary.lines[0].unitPriceCents).toBeNull();
  });

  it("href interne : catalogue via edition/slug, boutique-seul via slug", () => {
    const state: CartState = {
      version: CART_VERSION,
      lines: [{ id: 1, qty: 1 }, { id: 5, qty: 1 }],
    };
    const toteBag = book({ id: 5, slug: "tote-bag", title: "Tote bag", edition: null, origin: "boutique" });
    const summary = resolveCartSummary(state, [capital, toteBag], new Map());
    expect(summary.lines.find((l) => l.id === 1)?.href).toBe("/catalogue/editions-sociales/capital");
    expect(summary.lines.find((l) => l.id === 5)?.href).toBe("/boutique/tote-bag");
  });

  it("manifestOnly : vrai ssi toutes les lignes purchasable ont reducedShippingFlag, et qu'il y en a au moins une", () => {
    const state: CartState = { version: CART_VERSION, lines: [{ id: 1, qty: 1 }, { id: 2, qty: 1 }] };
    const flags = new Map([[1, true], [2, true]]);
    expect(resolveCartSummary(state, [capital, ideologie], flags).manifestOnly).toBe(true);
  });

  it("manifestOnly : faux dès qu'une ligne purchasable n'a pas le drapeau", () => {
    const state: CartState = { version: CART_VERSION, lines: [{ id: 1, qty: 1 }, { id: 2, qty: 1 }] };
    const flags = new Map([[1, true], [2, false]]);
    expect(resolveCartSummary(state, [capital, ideologie], flags).manifestOnly).toBe(false);
  });

  it("manifestOnly : faux sur un panier sans aucune ligne purchasable (jamais vrai par défaut)", () => {
    const epuise = book({ id: 3, slug: "epuise", title: "Épuisé", status: "unavailable", purchaseMode: "legacy-link" });
    const state: CartState = { version: CART_VERSION, lines: [{ id: 3, qty: 1 }] };
    expect(resolveCartSummary(state, [epuise], new Map([[3, true]])).manifestOnly).toBe(false);
  });

  it("isPreorder reflète le statut `preorder` (client 2026-08-20), false pour les autres lignes", () => {
    const precommande = book({
      id: 6,
      slug: "precommande",
      title: "Précommande",
      price: 22,
      status: "preorder",
      purchaseMode: "cart",
    });
    const state: CartState = { version: CART_VERSION, lines: [{ id: 1, qty: 1 }, { id: 6, qty: 1 }] };
    const summary = resolveCartSummary(state, [capital, precommande], new Map());
    expect(summary.lines.find((l) => l.id === 1)?.isPreorder).toBe(false);
    expect(summary.lines.find((l) => l.id === 6)?.isPreorder).toBe(true);
    // Une ligne précommande reste purchasable et compte dans le sous-total — le
    // même panier accueille les deux types de ligne, la scission n'a lieu
    // qu'à l'encaissement (`cart-quote.ts`).
    expect(summary.lines.find((l) => l.id === 6)?.purchasable).toBe(true);
  });

  it("drapeau absent de la carte → false par défaut (non-manifeste)", () => {
    const state: CartState = { version: CART_VERSION, lines: [{ id: 1, qty: 1 }] };
    expect(resolveCartSummary(state, [capital], new Map()).lines[0].reducedShippingFlag).toBe(false);
  });
});

/* ---------------------------------- totaux ---------------------------------- */

describe("computeCartTotals", () => {
  it("sans remise ni port : total = sous-total", () => {
    expect(computeCartTotals(5000, 0, null)).toEqual({
      subtotalCents: 5000,
      discountCents: 0,
      subtotalAfterDiscountCents: 5000,
      shippingCents: null,
      totalCents: null,
    });
  });

  it("port refusé (null) → total null même avec une remise", () => {
    expect(computeCartTotals(5000, 500, null).totalCents).toBeNull();
  });

  it("additionne remise + port quand les deux sont connus", () => {
    expect(computeCartTotals(5000, 500, 650)).toEqual({
      subtotalCents: 5000,
      discountCents: 500,
      subtotalAfterDiscountCents: 4500,
      shippingCents: 650,
      totalCents: 5150,
    });
  });

  it("plafonne la remise au sous-total (jamais de total négatif après remise)", () => {
    const totals = computeCartTotals(1000, 5000, 200);
    expect(totals.discountCents).toBe(1000);
    expect(totals.subtotalAfterDiscountCents).toBe(0);
    expect(totals.totalCents).toBe(200);
  });

  it("rejette une remise négative (jamais moins de 0)", () => {
    expect(computeCartTotals(1000, -50, 0).discountCents).toBe(0);
  });
});
