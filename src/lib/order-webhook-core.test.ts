import { describe, expect, it } from "vitest";
import {
  buildOrderCreateData,
  computePartTotalCents,
  computeStockAfterDecrement,
  type OrderAddressFacts,
  type OrderLineFacts,
  type OrderSessionFacts,
} from "./order-webhook-core";

const ADDRESS: OrderAddressFacts = {
  fullName: "Jean Dupont",
  addressLine1: "1 rue Paul Lafargue",
  addressLine2: null,
  postalCode: "75001",
  city: "Paris",
  country: "FR",
};

function facts(overrides: Partial<OrderSessionFacts> = {}): OrderSessionFacts {
  return {
    stripeSessionId: "cs_test_1",
    stripePaymentIntentId: "pi_test_1",
    email: "client@exemple.fr",
    phone: null,
    shippingAddress: ADDRESS,
    lines: [
      { bookId: 12, titleSnapshot: "Le Capital", isbnSnapshot: "978-1", quantity: 2, unitPriceCents: 1500 },
    ],
    orderType: "commande",
    shippingMethod: "standard",
    shippingCostCents: 650,
    discountCents: 0,
    promoCodeId: null,
    totalCents: 3650,
    paidAtISO: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildOrderCreateData", () => {
  it("assemble une commande payée complète", () => {
    const result = buildOrderCreateData(facts());
    expect(result).toEqual({
      status: "paid",
      orderType: "commande",
      email: "client@exemple.fr",
      phone: null,
      shippingAddress: ADDRESS,
      billingAddress: ADDRESS,
      lines: [
        { book: 12, titleSnapshot: "Le Capital", isbnSnapshot: "978-1", quantity: 2, unitPriceTTC: 15 },
      ],
      shippingMethod: "standard",
      shippingCostTTC: 6.5,
      promoCode: null,
      discountTTC: 0,
      totalTTC: 36.5,
      stripeSessionId: "cs_test_1",
      stripePaymentIntentId: "pi_test_1",
      paidAt: "2026-07-12T10:00:00.000Z",
      // Marqueurs d'effet (#64) : toujours faux à l'assemblage — aucun effet
      // n'a encore eu lieu, c'est `createPaidOrder` qui les lève un par un.
      stockDecremented: false,
      confirmationSent: false,
    });
  });

  it("billingAddress dupliquée depuis shippingAddress (pas de collecte distincte)", () => {
    const result = buildOrderCreateData(facts());
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.billingAddress).toBe(result.shippingAddress);
    }
  });

  it("statut « failed » explicitement demandé (échec de paiement différé)", () => {
    const result = buildOrderCreateData(facts(), "failed");
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.status).toBe("failed");
    }
  });

  it("promoCode/discount reportés fidèlement quand présents", () => {
    const result = buildOrderCreateData(facts({ promoCodeId: 7, discountCents: 500 }));
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.promoCode).toBe(7);
      expect(result.discountTTC).toBe(5);
    }
  });

  it("email absent → erreur, jamais une commande à moitié remplie", () => {
    expect(buildOrderCreateData(facts({ email: null }))).toEqual({
      error: "Session Stripe cs_test_1 : email absent.",
    });
  });

  it("adresse de livraison absente → erreur", () => {
    expect(buildOrderCreateData(facts({ shippingAddress: null }))).toEqual({
      error: "Session Stripe cs_test_1 : adresse de livraison absente.",
    });
  });

  it("aucune ligne décodée → erreur", () => {
    expect(buildOrderCreateData(facts({ lines: [] }))).toEqual({
      error: "Session Stripe cs_test_1 : aucune ligne décodée depuis les metadata.",
    });
  });

  it("orderType « precommande » reporté fidèlement (scission, client 2026-08-20)", () => {
    const result = buildOrderCreateData(facts({ orderType: "precommande" }));
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.orderType).toBe("precommande");
    }
  });

  it("orderType « don » (contreparties, client 2026-08-21) — lignes gratuites, port offert, total = montant du don", () => {
    const result = buildOrderCreateData(
      facts({
        orderType: "don",
        lines: [
          { bookId: 21, titleSnapshot: "Tote bag", isbnSnapshot: null, quantity: 1, unitPriceCents: 0 },
          {
            bookId: 22,
            titleSnapshot: "Planche de stickers",
            isbnSnapshot: null,
            quantity: 1,
            unitPriceCents: 0,
          },
        ],
        shippingMethod: "offert",
        shippingCostCents: 0,
        discountCents: 0,
        promoCodeId: null,
        totalCents: 5000, // palier à 50 € — le total reflète le don, pas la valeur des articles
      }),
    );
    expect(result).toEqual({
      status: "paid",
      orderType: "don",
      email: "client@exemple.fr",
      phone: null,
      shippingAddress: ADDRESS,
      billingAddress: ADDRESS,
      lines: [
        { book: 21, titleSnapshot: "Tote bag", isbnSnapshot: null, quantity: 1, unitPriceTTC: 0 },
        { book: 22, titleSnapshot: "Planche de stickers", isbnSnapshot: null, quantity: 1, unitPriceTTC: 0 },
      ],
      shippingMethod: "offert",
      shippingCostTTC: 0,
      promoCode: null,
      discountTTC: 0,
      totalTTC: 50,
      stripeSessionId: "cs_test_1",
      stripePaymentIntentId: "pi_test_1",
      paidAt: "2026-07-12T10:00:00.000Z",
      stockDecremented: false,
      confirmationSent: false,
    });
  });
});

describe("computePartTotalCents", () => {
  const LINES: OrderLineFacts[] = [
    { bookId: 1, titleSnapshot: "A", isbnSnapshot: null, quantity: 2, unitPriceCents: 1000 },
    { bookId: 2, titleSnapshot: "B", isbnSnapshot: null, quantity: 1, unitPriceCents: 500 },
  ];

  it("sous-total des lignes + port de l'envoi - remise déjà allouée", () => {
    // Sous-total 2500 - remise 300 + port 550 = 2750.
    expect(computePartTotalCents(LINES, 550, 300)).toBe(2750);
  });

  it("sans remise ni port (défensif)", () => {
    expect(computePartTotalCents(LINES, 0, 0)).toBe(2500);
  });

  it("plancher à 0 si la remise dépasse le sous-total (filet défensif, ne devrait pas arriver — cart-quote.ts garantit déjà l'allocation)", () => {
    expect(computePartTotalCents(LINES, 0, 999_999)).toBe(0);
  });

  it("liste de lignes vide → seul le port compte", () => {
    expect(computePartTotalCents([], 250, 0)).toBe(250);
  });
});

describe("computeStockAfterDecrement", () => {
  it("décrémente normalement", () => {
    expect(computeStockAfterDecrement(10, 3)).toBe(7);
  });
  it("plancher à 0, jamais négatif", () => {
    expect(computeStockAfterDecrement(2, 5)).toBe(0);
  });
  it("stock non suivi (`null`) reste `null`", () => {
    expect(computeStockAfterDecrement(null, 3)).toBeNull();
  });
  it("exactement épuisé", () => {
    expect(computeStockAfterDecrement(3, 3)).toBe(0);
  });

  describe("allowNegative (don avec contrepartie, client 2026-08-21)", () => {
    it("passe sous 0 sans plancher quand demandé", () => {
      expect(computeStockAfterDecrement(2, 5, { allowNegative: true })).toBe(-3);
    });
    it("comportement normal (plancher 0) tant que le stock suffit", () => {
      expect(computeStockAfterDecrement(10, 3, { allowNegative: true })).toBe(7);
    });
    it("stock non suivi (`null`) reste `null` même avec allowNegative", () => {
      expect(computeStockAfterDecrement(null, 3, { allowNegative: true })).toBeNull();
    });
    it("allowNegative: false explicite → même comportement que le défaut (plancher 0)", () => {
      expect(computeStockAfterDecrement(2, 5, { allowNegative: false })).toBe(0);
    });
  });
});
