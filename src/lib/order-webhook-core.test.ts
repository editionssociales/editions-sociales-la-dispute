import { describe, expect, it } from "vitest";
import {
  buildOrderCreateData,
  computeStockAfterDecrement,
  type OrderAddressFacts,
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
    shippingAddress: ADDRESS,
    lines: [
      { bookId: 12, titleSnapshot: "Le Capital", isbnSnapshot: "978-1", quantity: 2, unitPriceCents: 1500 },
    ],
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
      email: "client@exemple.fr",
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
});
