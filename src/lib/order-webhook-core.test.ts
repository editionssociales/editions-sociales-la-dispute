import { describe, expect, it } from "vitest";
import type { Order } from "@/payload-types";
import {
  addressFromStripe,
  buildOrderCreateData,
  computePartTotalCents,
  computeStockAfterDecrement,
  metadataCents,
  metadataPromoCodeId,
  recapAddressFromOrder,
  resolveDonationLines,
  toOrderCountry,
  type DonationBookFacts,
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

describe("toOrderCountry", () => {
  it.each(["FR", "BE", "CH"] as const)("%s (pays vendu) reporté tel quel", (country) => {
    expect(toOrderCountry(country)).toBe(country);
  });
  it("pays hors FR/BE/CH → repli défensif FR (shipping_address_collection ne devrait jamais le produire)", () => {
    expect(toOrderCountry("DE")).toBe("FR");
  });
  it("null → repli FR", () => {
    expect(toOrderCountry(null)).toBe("FR");
  });
  it("chaîne vide → repli FR", () => {
    expect(toOrderCountry("")).toBe("FR");
  });
});

describe("metadataCents", () => {
  it("montant en centimes lu tel quel", () => {
    expect(metadataCents("650")).toBe(650);
  });
  it("zéro explicite reste zéro", () => {
    expect(metadataCents("0")).toBe(0);
  });
  it("metadata absente → 0, jamais NaN stocké", () => {
    expect(metadataCents(undefined)).toBe(0);
  });
  it("metadata illisible (corrompue) → 0", () => {
    expect(metadataCents("abc")).toBe(0);
  });
});

describe("metadataPromoCodeId", () => {
  it("id lu tel quel", () => {
    expect(metadataPromoCodeId("7")).toBe(7);
  });
  it("metadata absente → null", () => {
    expect(metadataPromoCodeId(undefined)).toBeNull();
  });
  it("chaîne vide (checkout sans code promo) → null", () => {
    expect(metadataPromoCodeId("")).toBeNull();
  });
  it("metadata illisible → null", () => {
    expect(metadataPromoCodeId("abc")).toBeNull();
  });
});

describe("addressFromStripe", () => {
  const STRIPE_ADDRESS = {
    line1: "1 rue Paul Lafargue",
    line2: null,
    city: "Paris",
    postal_code: "75001",
    country: "FR",
    state: null,
  };

  it("adresse complète → faits Orders (line2 nulle devient undefined)", () => {
    expect(addressFromStripe({ name: "Jean Dupont", address: STRIPE_ADDRESS })).toEqual({
      fullName: "Jean Dupont",
      addressLine1: "1 rue Paul Lafargue",
      addressLine2: undefined,
      postalCode: "75001",
      city: "Paris",
      country: "FR",
    });
  });

  it("shipping_details absent (anomalie sur une session complétée) → null", () => {
    expect(addressFromStripe(null)).toBeNull();
    expect(addressFromStripe(undefined)).toBeNull();
  });

  it("adresse partielle (champs nuls côté Stripe) → chaînes vides, jamais un champ inventé", () => {
    expect(
      addressFromStripe({
        name: "Jean Dupont",
        address: { line1: null, line2: null, city: null, postal_code: null, country: null, state: null },
      }),
    ).toEqual({
      fullName: "Jean Dupont",
      addressLine1: "",
      addressLine2: undefined,
      postalCode: "",
      city: "",
      country: "FR", // pays absent → même repli défensif que toOrderCountry
    });
  });

  it("line2 renseignée reportée fidèlement", () => {
    const result = addressFromStripe({
      name: "Jean Dupont",
      address: { ...STRIPE_ADDRESS, line2: "Bâtiment B" },
    });
    expect(result?.addressLine2).toBe("Bâtiment B");
  });

  it("pays hors zone vendue → repli FR (même règle que toOrderCountry)", () => {
    const result = addressFromStripe({
      name: "Jean Dupont",
      address: { ...STRIPE_ADDRESS, country: "DE" },
    });
    expect(result?.country).toBe("FR");
  });
});

describe("resolveDonationLines", () => {
  const BOOKS = new Map<number, DonationBookFacts>([
    [21, { title: "Tote bag", isbn: null }],
    [22, { title: "Planche de stickers", isbn: "978-9" }],
  ]);

  it("joint titre/ISBN relus fraîchement, prix toujours reporté tel quel (0 en contrepartie)", () => {
    const { lines, missingBookIds } = resolveDonationLines(
      [
        { id: 21, qty: 1, unitPriceCents: 0 },
        { id: 22, qty: 2, unitPriceCents: 0 },
      ],
      BOOKS,
    );
    expect(lines).toEqual([
      { bookId: 21, titleSnapshot: "Tote bag", isbnSnapshot: null, quantity: 1, unitPriceCents: 0 },
      { bookId: 22, titleSnapshot: "Planche de stickers", isbnSnapshot: "978-9", quantity: 2, unitPriceCents: 0 },
    ]);
    expect(missingBookIds).toEqual([]);
  });

  it("contrepartie disparue → titre de repli, JAMAIS une ligne omise (elle a été promise au donateur), id retourné à l'appelant", () => {
    const { lines, missingBookIds } = resolveDonationLines(
      [
        { id: 99, qty: 1, unitPriceCents: 0 },
        { id: 21, qty: 1, unitPriceCents: 0 },
      ],
      BOOKS,
    );
    expect(lines).toEqual([
      { bookId: 99, titleSnapshot: "Article #99", isbnSnapshot: null, quantity: 1, unitPriceCents: 0 },
      { bookId: 21, titleSnapshot: "Tote bag", isbnSnapshot: null, quantity: 1, unitPriceCents: 0 },
    ]);
    expect(missingBookIds).toEqual([99]);
  });

  it("aucune ligne décodée → vide des deux côtés", () => {
    expect(resolveDonationLines([], BOOKS)).toEqual({ lines: [], missingBookIds: [] });
  });
});

describe("recapAddressFromOrder", () => {
  it("adresse de la commande → adresse du récap mail (line2 nulle devient undefined)", () => {
    expect(recapAddressFromOrder({ shippingAddress: { ...ADDRESS } })).toEqual({
      fullName: "Jean Dupont",
      addressLine1: "1 rue Paul Lafargue",
      addressLine2: undefined,
      postalCode: "75001",
      city: "Paris",
      country: "FR",
    });
  });

  it("line2 renseignée reportée fidèlement", () => {
    const recap = recapAddressFromOrder({
      shippingAddress: { ...ADDRESS, addressLine2: "Bâtiment B" },
    });
    expect(recap?.addressLine2).toBe("Bâtiment B");
  });

  it("commande sans adresse (anomalie — jamais pour un don 2026) → undefined, jamais un bloc adresse inventé", () => {
    expect(
      recapAddressFromOrder({ shippingAddress: undefined as unknown as Order["shippingAddress"] }),
    ).toBeUndefined();
  });
});
