import { describe, expect, it } from "vitest";

import {
  computeVatPart,
  formatComptaCsv,
  formatPreparationCsv,
  PREPARATION_ORDER_STATUSES,
  type OrderExportRow,
} from "./order-export.ts";

function address(overrides: Partial<OrderExportRow["shippingAddress"]> = {}) {
  return {
    fullName: "Jeanne Dupont",
    addressLine1: "12 rue des Fables",
    addressLine2: null,
    postalCode: "75020",
    city: "Paris",
    country: "FR",
    ...overrides,
  };
}

function order(overrides: Partial<OrderExportRow> = {}): OrderExportRow {
  return {
    number: "CMD-000042",
    orderType: "commande",
    createdAt: "2026-07-10T14:32:00.000Z",
    status: "paid",
    email: "jeanne@example.org",
    lines: [
      { bookId: 101, isbn: "9782360830001", title: "Le Capital, livre 1", quantity: 2, unitPriceTTC: 12.5 },
    ],
    shippingAddress: address(),
    billingAddress: address(),
    totalTTC: 25,
    shippingCostTTC: 4.5,
    discountTTC: 0,
    couponCode: null,
    stripeSessionId: "cs_123",
    stripePaymentIntentId: "pi_123",
    ...overrides,
  };
}

describe("computeVatPart", () => {
  it("ventile la TVA à 5,5 % incluse (TTC/1,055)", () => {
    // 20 € HT * 1,055 = 21,10 € TTC exact — vérifie l'absence de dérive flottante.
    expect(computeVatPart(21.1)).toBeCloseTo(1.1, 2);
  });

  it("arrondit au centime sur un montant qui ne tombe pas rond", () => {
    // 10 / 1,055 = 9,4786… → part TVA = 0,5213… → arrondi 0,52.
    expect(computeVatPart(10)).toBeCloseTo(0.52, 2);
  });

  it("un total nul ne ventile rien", () => {
    expect(computeVatPart(0)).toBe(0);
  });
});

describe("PREPARATION_ORDER_STATUSES", () => {
  it("couvre exactement paid/prepared — pas shipped/cancelled/refunded/failed", () => {
    expect(PREPARATION_ORDER_STATUSES).toEqual(["paid", "prepared"]);
  });
});

describe("formatPreparationCsv", () => {
  it("émet l'en-tête exact du profil AOE décalqué", () => {
    const csv = formatPreparationCsv([]);
    expect(csv).toBe(
      "E-mail du client;Type;Article #;UGS(ISBN);Nom;Quantité;Prix du produit;Code de coupon;Réduction\r\n",
    );
  });

  it("une ligne par ligne de commande, type/coupon/remise répétés sur chaque ligne", () => {
    const csv = formatPreparationCsv([
      order({
        email: "jeanne@example.org",
        couponCode: "SOLIDAIRE10",
        discountTTC: 2.5,
        lines: [
          { bookId: 101, isbn: "9782360830001", title: "Le Capital, livre 1", quantity: 2, unitPriceTTC: 12.5 },
          { bookId: 202, isbn: null, title: "Sans ISBN", quantity: 1, unitPriceTTC: 8 },
        ],
      }),
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3); // en-tête + 2 lignes d'article
    expect(lines[1]).toBe(
      "jeanne@example.org;Commande;101;9782360830001;Le Capital, livre 1;2;12,50;SOLIDAIRE10;2,50",
    );
    expect(lines[2]).toBe("jeanne@example.org;Commande;202;;Sans ISBN;1;8,00;SOLIDAIRE10;2,50");
  });

  it("libellé « Précommande » quand orderType = precommande", () => {
    const csv = formatPreparationCsv([
      order({
        orderType: "precommande",
        lines: [
          { bookId: 5, isbn: "9782000000005", title: "Livre à paraître", quantity: 1, unitPriceTTC: 20 },
        ],
      }),
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe("jeanne@example.org;Précommande;5;9782000000005;Livre à paraître;1;20,00;;0,00");
  });

  it("libellé « Don » quand orderType = don — apparaît normalement (l'export préparation ne change pas)", () => {
    const csv = formatPreparationCsv([
      order({
        orderType: "don",
        lines: [
          { bookId: 9, isbn: null, title: "Contrepartie tote bag", quantity: 1, unitPriceTTC: 50 },
        ],
      }),
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe("jeanne@example.org;Don;9;;Contrepartie tote bag;1;50,00;;0,00");
  });

  it("échappe un titre contenant le séparateur (RFC 4180)", () => {
    const csv = formatPreparationCsv([
      order({
        lines: [
          { bookId: 1, isbn: null, title: 'Titre; avec "guillemets"', quantity: 1, unitPriceTTC: 10 },
        ],
      }),
    ]);
    expect(csv).toContain('"Titre; avec ""guillemets"""');
  });

  it("une commande sans ligne ne produit aucune ligne CSV (mais ne jette pas)", () => {
    const csv = formatPreparationCsv([order({ lines: [] })]);
    expect(csv.trim().split("\r\n")).toHaveLength(1); // en-tête seule
  });
});

describe("formatComptaCsv", () => {
  it("émet l'en-tête exact du profil compta", () => {
    const csv = formatComptaCsv([]);
    expect(csv.split("\r\n")[0]).toBe(
      [
        "N° commande",
        "Type",
        "Date",
        "Statut",
        "Email",
        "Nom (livraison)",
        "Adresse (livraison)",
        "Complément (livraison)",
        "Code postal (livraison)",
        "Ville (livraison)",
        "Pays (livraison)",
        "Nom (facturation)",
        "Adresse (facturation)",
        "Complément (facturation)",
        "Code postal (facturation)",
        "Ville (facturation)",
        "Pays (facturation)",
        "Total TTC",
        "Port TTC",
        "Remise TTC",
        "Part TVA 5,5 % (calculée)",
        "Moyen de paiement",
        "Session Stripe",
        "Référence Stripe (PaymentIntent)",
      ].join(";"),
    );
  });

  it("une ligne par commande (pas par article), type/statut en libellé FR, TVA ventilée, moyen de paiement figé à Stripe", () => {
    const csv = formatComptaCsv([
      order({
        number: "CMD-000042",
        orderType: "precommande",
        createdAt: "2026-07-10T14:32:00.000Z",
        status: "shipped",
        totalTTC: 29.5,
        shippingCostTTC: 4.5,
        discountTTC: 0,
        stripeSessionId: "cs_123",
        stripePaymentIntentId: "pi_abc",
        lines: [
          { bookId: 1, isbn: "9780000000001", title: "A", quantity: 1, unitPriceTTC: 25 },
          { bookId: 2, isbn: "9780000000002", title: "B", quantity: 1, unitPriceTTC: 4.5 },
        ],
      }),
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2); // en-tête + 1 commande, quel que soit le nombre de lignes d'article
    const cells = lines[1].split(";");
    expect(cells[0]).toBe("CMD-000042");
    expect(cells[1]).toBe("Précommande");
    expect(cells[2]).toBe("2026-07-10");
    expect(cells[3]).toBe("Expédiée");
    expect(cells.at(-3)).toBe("Stripe");
    expect(cells.at(-2)).toBe("cs_123");
    expect(cells.at(-1)).toBe("pi_abc");
    expect(cells[17]).toBe("29,50"); // Total TTC
    expect(cells[20]).toBe(formatVatCell(29.5)); // Part TVA calculée
  });

  it("adresses de facturation distinctes de la livraison quand elles diffèrent", () => {
    const csv = formatComptaCsv([
      order({
        shippingAddress: address({ city: "Paris" }),
        billingAddress: address({ city: "Lyon", fullName: "Autre Nom" }),
      }),
    ]);
    const cells = csv.trim().split("\r\n")[1].split(";");
    // Colonnes livraison : index 5..10 ; facturation : 11..16 (cf. en-tête).
    expect(cells[9]).toBe("Paris");
    expect(cells[15]).toBe("Lyon");
    expect(cells[11]).toBe("Autre Nom");
  });

  it("statut inconnu retombe sur la valeur brute (jamais un libellé inventé)", () => {
    const csv = formatComptaCsv([order({ status: "on-hold-legacy" })]);
    const cells = csv.trim().split("\r\n")[1].split(";");
    expect(cells[3]).toBe("on-hold-legacy");
  });

  it("type inconnu retombe sur la valeur brute (jamais un libellé inventé)", () => {
    const csv = formatComptaCsv([order({ orderType: "on-hold-legacy" })]);
    const cells = csv.trim().split("\r\n")[1].split(";");
    expect(cells[1]).toBe("on-hold-legacy");
  });

  it("stripeSessionId absent (null) → cellule vide, jamais une valeur inventée", () => {
    const csv = formatComptaCsv([order({ stripeSessionId: null })]);
    const cells = csv.trim().split("\r\n")[1].split(";");
    expect(cells.at(-2)).toBe("");
  });

  it("don : libellé Type « Don », part TVA vide (pas une vente), total TTC affiché tel quel", () => {
    const csv = formatComptaCsv([
      order({
        orderType: "don",
        totalTTC: 50,
      }),
    ]);
    const cells = csv.trim().split("\r\n")[1].split(";");
    expect(cells[1]).toBe("Don");
    expect(cells[17]).toBe("50,00"); // Total TTC — affiché tel quel, non recalculé
    expect(cells[20]).toBe(""); // Part TVA — vide, un don n'est pas une vente
  });
});

function formatVatCell(totalTTC: number): string {
  return computeVatPart(totalTTC).toFixed(2).replace(".", ",");
}
