import { describe, expect, it } from "vitest";
import {
  aggregateImportReport,
  buildOrderLines,
  buildProductMappingReport,
  buildProductMatchIndex,
  checkArithmeticMismatch,
  cleanLineTitle,
  computeCreatedAt,
  computeOrderType,
  computePaidAt,
  computeShippingMethod,
  isPostBascule,
  mapWooStatus,
  matchProduct,
  normalizeTitle,
  PRECOMMANDE_PRODUCT_ID,
  repairEmail,
  resolveAddresses,
  resolvePrecommandeBook,
  transformOrder,
  wooStripeSessionId,
  type BookIndexEntry,
  type ProductMatchIndex,
  type RedirectEntry,
  type WooAddressRaw,
  type WooLineItemInput,
  type WooOrderInput,
  type WooProductRef,
} from "./import-orders-woo-core.ts";

/* ─────────────────────────── fixtures ─────────────────────────── */

function book(overrides: Partial<BookIndexEntry> & { id: number; slug: string; title: string }): BookIndexEntry {
  return {
    edition: "editions-sociales",
    isbn: null,
    origin: "catalogue",
    ...overrides,
  };
}

function address(overrides: Partial<WooAddressRaw> = {}): WooAddressRaw {
  return {
    firstName: "David",
    lastName: "Courteille",
    address1: "5 ter Rue du Petit Beaubourg",
    address2: null,
    city: "Saint Maur des Fossés",
    postcode: "94100",
    country: "FR",
    ...overrides,
  };
}

function emptyAddress(): WooAddressRaw {
  return { firstName: null, lastName: null, address1: null, address2: null, city: null, postcode: null, country: null };
}

function buildIndex(opts: {
  products?: WooProductRef[];
  redirects?: Record<string, RedirectEntry>;
  books?: BookIndexEntry[];
}): ProductMatchIndex {
  return buildProductMatchIndex(opts.products ?? [], opts.redirects ?? {}, opts.books ?? []);
}

const ETAT_ET_REVOLUTION = book({ id: 900, slug: "letat-et-la-revolution-citoyenne", title: "L'État et la révolution citoyenne" });

function indexWithPrecommandeResolved(): ProductMatchIndex {
  return buildIndex({
    products: [{ id: PRECOMMANDE_PRODUCT_ID, slug: "etat-et-revolution-citoyenne", title: "PRÉCOMMANDE --<i>L’État et la révolution citoyenne </i>" }],
    books: [ETAT_ET_REVOLUTION],
  });
}

/* ─────────────────────────── mapWooStatus ─────────────────────────── */

describe("mapWooStatus", () => {
  it("mappe les 5 statuts Woo simples vers leur statut Orders", () => {
    expect(mapWooStatus("wc-completed", false)).toBe("shipped");
    expect(mapWooStatus("wc-processing", false)).toBe("paid");
    expect(mapWooStatus("wc-cancelled", false)).toBe("cancelled");
    expect(mapWooStatus("wc-refunded", false)).toBe("refunded");
    expect(mapWooStatus("wc-failed", false)).toBe("failed");
  });

  it("wc-on-hold → paid si signal de paiement, cancelled sinon (11 cas réels du dump, tous sans signal → cancelled)", () => {
    expect(mapWooStatus("wc-on-hold", true)).toBe("paid");
    expect(mapWooStatus("wc-on-hold", false)).toBe("cancelled");
  });

  it("statut inattendu → null (exclusion)", () => {
    expect(mapWooStatus("wc-pending", false)).toBeNull();
  });
});

/* ─────────────────────────── dates ─────────────────────────── */

describe("computeCreatedAt", () => {
  it("post_date_gmt (UTC) traité tel quel", () => {
    expect(computeCreatedAt("2018-03-14 20:47:48", "2018-03-14 21:47:48")).toBe("2018-03-14T20:47:48.000Z");
  });

  it("post_date_gmt à zéro → repli sur post_date interprété Europe/Paris (été, +02:00)", () => {
    // 14 juillet 2026 10:00 heure de Paris (été) = 08:00 UTC.
    expect(computeCreatedAt("0000-00-00 00:00:00", "2026-07-14 10:00:00")).toBe("2026-07-14T08:00:00.000Z");
  });

  it("post_date_gmt à zéro → repli sur post_date interprété Europe/Paris (hiver, +01:00)", () => {
    expect(computeCreatedAt("0000-00-00 00:00:00", "2026-01-14 10:00:00")).toBe("2026-01-14T09:00:00.000Z");
  });

  it("jette si aucune date exploitable", () => {
    expect(() => computeCreatedAt(null, null)).toThrow();
  });
});

describe("computePaidAt", () => {
  it("_date_paid (epoch secondes) prioritaire", () => {
    expect(computePaidAt("1521060584", null, "paid", "2018-01-01T00:00:00.000Z")).toBe(
      new Date(1521060584 * 1000).toISOString(),
    );
  });

  it("sinon _paid_date (Paris)", () => {
    expect(computePaidAt(null, "2026-07-14 10:00:00", "paid", "2018-01-01T00:00:00.000Z")).toBe(
      "2026-07-14T08:00:00.000Z",
    );
  });

  it("sinon createdAt si statut cible payé/préparé/expédié/remboursé", () => {
    for (const status of ["paid", "prepared", "shipped", "refunded"] as const) {
      expect(computePaidAt(null, null, status, "2020-01-01T00:00:00.000Z")).toBe("2020-01-01T00:00:00.000Z");
    }
  });

  it("sinon null (cancelled/failed sans signal)", () => {
    expect(computePaidAt(null, null, "cancelled", "2020-01-01T00:00:00.000Z")).toBeNull();
    expect(computePaidAt(null, null, "failed", "2020-01-01T00:00:00.000Z")).toBeNull();
  });
});

describe("isPostBascule", () => {
  it("post_date >= 2026-08-19 (bascule ld-es.fr) → true", () => {
    expect(isPostBascule("2026-08-19 00:52:08")).toBe(true);
    expect(isPostBascule("2026-08-18 23:59:59")).toBe(false);
  });
});

/* ─────────────────────────── nettoyage HTML / titres ─────────────────────────── */

describe("cleanLineTitle", () => {
  it("cas obligatoire : balises → espaces, entités décodées, espaces effondrés, trim", () => {
    expect(cleanLineTitle("Friedrich Engels<br><i>Les Principes du communisme</i>")).toBe(
      "Friedrich Engels Les Principes du communisme",
    );
  });

  it("décode &times; et &eacute;", () => {
    expect(cleanLineTitle("Salaires &times; prix &eacute;lev&eacute;s")).toBe("Salaires × prix élevés");
  });
});

describe("normalizeTitle", () => {
  it("aligne le titre produit précommande (préfixe retiré) sur le titre catalogue", () => {
    expect(normalizeTitle("PRÉCOMMANDE --<i>L’État et la révolution citoyenne </i>")).toBe(
      normalizeTitle("L'État et la révolution citoyenne"),
    );
  });

  it("insensible à la casse/diacritiques/ponctuation", () => {
    expect(normalizeTitle("Découvrir Gorz !")).toBe(normalizeTitle("decouvrir   gorz"));
  });
});

/* ─────────────────────────── e-mail ─────────────────────────── */

describe("repairEmail", () => {
  it("email valide → trim + minuscules, non réparé", () => {
    expect(repairEmail("  Foo.Bar@Example.COM ", 1)).toEqual({ email: "foo.bar@example.com", repaired: false, method: null });
  });

  it("cas obligatoire (#6553/#6554) : extraction ancrée sur TLD connu", () => {
    expect(repairEmail("gillestanguy0856@gmail.comGt31081956", 6553)).toEqual({
      email: "gillestanguy0856@gmail.com",
      repaired: true,
      method: "extraction",
    });
    expect(repairEmail("gillestanguy0856@gmail.comGt31081956", 6554)).toEqual({
      email: "gillestanguy0856@gmail.com",
      repaired: true,
      method: "extraction",
    });
  });

  it("repli legacy-<ID>@archive.ld-es.fr si aucune extraction possible", () => {
    expect(repairEmail("pas un email", 42)).toEqual({
      email: "legacy-42@archive.ld-es.fr",
      repaired: true,
      method: "fallback",
    });
    expect(repairEmail(null, 43)).toEqual({
      email: "legacy-43@archive.ld-es.fr",
      repaired: true,
      method: "fallback",
    });
  });
});

/* ─────────────────────────── adresses ─────────────────────────── */

describe("resolveAddresses", () => {
  it("commande normale : billing et shipping distincts, tous deux FR", () => {
    const result = resolveAddresses(address(), address({ address1: "Autre adresse" }));
    expect(result.billingAddress.addressLine1).toBe("5 ter Rue du Petit Beaubourg");
    expect(result.shippingAddress.addressLine1).toBe("Autre adresse");
    expect(result.countryRepairs).toEqual([]);
  });

  it("193 commandes sans shipping → billing intégral (repli champ par champ)", () => {
    const result = resolveAddresses(address(), emptyAddress());
    expect(result.shippingAddress).toEqual(result.billingAddress);
  });

  it("fullName '—' si prénom/nom absents des deux côtés", () => {
    const result = resolveAddresses(emptyAddress(), emptyAddress());
    expect(result.billingAddress.fullName).toBe("—");
    expect(result.billingAddress.addressLine1).toBe("—");
    expect(result.billingAddress.postalCode).toBe("—");
    expect(result.billingAddress.city).toBe("—");
  });

  it("cas réel unique #192 : pays hors FR/BE/CH (IT) → FR + suffixe [IT] sur addressLine2, billing et shipping indépendamment", () => {
    const result = resolveAddresses(address({ country: "IT" }), address({ country: "IT", address2: null }));
    expect(result.billingAddress.country).toBe("FR");
    expect(result.billingAddress.addressLine2).toBe("[IT]");
    expect(result.shippingAddress.country).toBe("FR");
    expect(result.shippingAddress.addressLine2).toBe("[IT]");
    expect(result.countryRepairs).toEqual([
      { scope: "billing", code: "IT" },
      { scope: "shipping", code: "IT" },
    ]);
  });

  it("shipping country vide → reprend le pays RÉSOLU de billing (pas de double réparation)", () => {
    const result = resolveAddresses(address({ country: "BE" }), emptyAddress());
    expect(result.shippingAddress.country).toBe("BE");
  });

  it("ligne 2 : complétée depuis billing si MÊME adresse (line1 identique), jamais greffée sur une adresse différente (cas réel #159)", () => {
    // Même adresse (line1 identique, line2 shipping vide) → le complément
    // d'adresse de facturation s'applique aussi à la livraison.
    const same = resolveAddresses(address({ address2: "Bâtiment B" }), address({ address2: null }));
    expect(same.shippingAddress.addressLine2).toBe("Bâtiment B");
    // Adresse de livraison DIFFÉRENTE sans ligne 2 → on ne greffe pas le
    // complément de facturation (adresse chimère interdite).
    const different = resolveAddresses(
      address({ address2: "Bâtiment B" }),
      address({ address1: "Autre adresse", address2: null }),
    );
    expect(different.shippingAddress.addressLine1).toBe("Autre adresse");
    expect(different.shippingAddress.addressLine2).toBeUndefined();
  });
});

/* ─────────────────────────── méthode de port ─────────────────────────── */

describe("computeShippingMethod", () => {
  it("pas de ligne shipping → offert", () => {
    expect(computeShippingMethod(null, 5)).toBe("offert");
  });
  it("coût 0 → offert, même avec un libellé", () => {
    expect(computeShippingMethod("Livraison gratuite", 0)).toBe("offert");
  });
  it("libellé contenant 'manifeste' → reduit", () => {
    expect(computeShippingMethod("manifeste", 3)).toBe("reduit");
  });
  it("sinon standard", () => {
    expect(computeShippingMethod("moins de 49", 5.5)).toBe("standard");
  });
});

/* ─────────────────────────── arithmétique ─────────────────────────── */

describe("checkArithmeticMismatch", () => {
  it("cohérent (écart nul) → pas de mismatch", () => {
    expect(checkArithmeticMismatch(100, 0, 0, 100)).toBe(false);
  });
  it("dans la tolérance (0,02 €) → pas de mismatch", () => {
    expect(checkArithmeticMismatch(100, 0, 0, 100.02)).toBe(false);
  });
  it("hors tolérance → mismatch", () => {
    expect(checkArithmeticMismatch(100, 0, 0, 90)).toBe(true);
  });
});

/* ─────────────────────────── chaîne d'appariement produit ─────────────────────────── */

describe("matchProduct — chaîne à 4 buckets", () => {
  const target = book({ id: 1, slug: "decouvrir-gorz", title: "Céline Marty, Découvrir Gorz" });

  it("bucket 'redirects' : produit existant apparié via redirects-produits.json (edition+slug)", () => {
    const index = buildIndex({
      products: [{ id: 10, slug: "celine-marty-decouvrir-gorz-prevente", title: "Découvrir Gorz (précommande)" }],
      redirects: { "celine-marty-decouvrir-gorz-prevente": { edition: "editions-sociales", slug: "decouvrir-gorz" } },
      books: [target],
    });
    expect(matchProduct(10, "", index)).toEqual({ bucket: "redirects", book: target });
  });

  it("bucket 'slug-direct' : pas de redirection mais slug produit == slug fiche", () => {
    const index = buildIndex({
      products: [{ id: 11, slug: "decouvrir-gorz", title: "Un autre intitulé" }],
      books: [target],
    });
    expect(matchProduct(11, "", index)).toEqual({ bucket: "slug-direct", book: target });
  });

  it("bucket 'titre' : ni redirection ni slug, titre normalisé du produit égal à celui de la fiche", () => {
    const index = buildIndex({
      products: [{ id: 12, slug: "produit-slug-different", title: "Céline Marty, Découvrir Gorz" }],
      books: [target],
    });
    expect(matchProduct(12, "", index)).toEqual({ bucket: "titre", book: target });
  });

  it("bucket 'titre-ligne' : produit supprimé (137 cas du dump), appariement par titre normalisé de order_item_name", () => {
    const index = buildIndex({ books: [target] });
    expect(matchProduct(999999, "Céline Marty, Découvrir Gorz", index)).toEqual({ bucket: "titre-ligne", book: target });
  });

  it("bucket 'repli' : aucun appariement possible", () => {
    const index = buildIndex({ books: [target] });
    expect(matchProduct(999999, "Un produit totalement inconnu", index)).toEqual({ bucket: "repli", book: null });
  });

  it("bucket 'titre-auteur' (virgule) : titre Woo « Auteur, Titre » vs fiche portant le titre seul (cas réel #2173)", () => {
    const chapitreVi = book({ id: 2, slug: "le-chapitre-vi", title: "Le chapitre VI. Manuscrits de 1863-1867." });
    const existing = buildIndex({
      products: [{ id: 2173, slug: "chapitre-vi", title: "Karl Marx, Le chapitre VI. Manuscrits de 1863-1867." }],
      books: [chapitreVi],
    });
    expect(matchProduct(2173, "", existing)).toEqual({ bucket: "titre-auteur", book: chapitreVi });
    // Produit supprimé : même heuristique depuis order_item_name.
    const deleted = buildIndex({ books: [chapitreVi] });
    expect(matchProduct(999999, "Karl Marx, Le chapitre VI. Manuscrits de 1863-1867.", deleted)).toEqual({
      bucket: "titre-auteur",
      book: chapitreVi,
    });
  });

  it("bucket 'titre-auteur' (suffixe) : liste d'auteurs à virgules, titre de fiche en suffixe unique (cas réel #3495)", () => {
    const avecMarx = book({ id: 3, slug: "avec-marx", title: "Avec Marx, philosophie et politique" });
    const index = buildIndex({
      products: [{ id: 3495, slug: "avec-marx-woo", title: "Badiou, Balibar, Bidet, Löwy, Sève, Avec Marx, philosophie et politique" }],
      books: [avecMarx],
    });
    expect(matchProduct(3495, "", index)).toEqual({ bucket: "titre-auteur", book: avecMarx });
  });

  it("'titre-auteur' abandonne à la moindre ambiguïté (deux titres suffixes possibles → repli)", () => {
    const capital = book({ id: 4, slug: "le-capital-court", title: "Le Capital abrégé" });
    const etudier = book({ id: 5, slug: "etudier-le-capital", title: "Étudier Le Capital abrégé" });
    const index = buildIndex({
      products: [{ id: 50, slug: "produit-x", title: "Karl Marx, Étudier Le Capital abrégé" }],
      books: [capital, etudier],
    });
    // Après la virgule : « Étudier Le Capital abrégé » correspond exactement à
    // UNE fiche → heuristique virgule prioritaire, pas d'ambiguïté ici.
    expect(matchProduct(50, "", index).bucket).toBe("titre-auteur");
    // Sans la virgule (produit supprimé, nom sans auteur) : deux suffixes
    // possibles (« Le Capital abrégé » et « Étudier Le Capital abrégé ») → repli.
    const deleted = buildIndex({ books: [capital, etudier] });
    expect(matchProduct(999999, "Coffret Étudier Le Capital abrégé", deleted)).toEqual({ bucket: "repli", book: null });
  });

  it("cas obligatoire : produit 7870 résout vers la vraie fiche malgré le préfixe « PRÉCOMMANDE »", () => {
    const index = indexWithPrecommandeResolved();
    const result = matchProduct(PRECOMMANDE_PRODUCT_ID, "", index);
    expect(result.bucket).toBe("titre");
    expect(result.book).toEqual(ETAT_ET_REVOLUTION);
  });
});

describe("resolvePrecommandeBook — garde-fou ABORT", () => {
  it("résout la fiche quand l'appariement du produit 7870 réussit", () => {
    expect(resolvePrecommandeBook(indexWithPrecommandeResolved())).toEqual(ETAT_ET_REVOLUTION);
  });

  it("ABORT explicite (jette) si le produit 7870 ne s'apparie à aucune fiche — jamais de repli silencieux", () => {
    const index = buildIndex({
      products: [{ id: PRECOMMANDE_PRODUCT_ID, slug: "etat-et-revolution-citoyenne", title: "PRÉCOMMANDE — Un titre qui ne correspond à rien" }],
      books: [],
    });
    expect(() => resolvePrecommandeBook(index)).toThrow(/ABORT/);
  });
});

/* ─────────────────────────── lignes de commande ─────────────────────────── */

describe("buildOrderLines", () => {
  it("quantity/unitPriceTTC/titleSnapshot/isbnSnapshot/book calculés depuis les métadonnées Woo", () => {
    const target = book({ id: 5, slug: "decouvrir-marx", title: "Découvrir Marx", isbn: "9782000000000" });
    const index = buildIndex({
      products: [{ id: 5, slug: "decouvrir-marx", title: "Florian Gulli et Jean Quétier, Découvrir Marx" }],
      books: [target],
    });
    const lines: WooLineItemInput[] = [
      { orderItemId: 1, productId: 5, orderItemName: "Florian Gulli et Jean Quétier, Découvrir Marx", qty: "2", lineSubtotal: "24" },
    ];
    const result = buildOrderLines(lines, index, -1);
    expect(result.lines).toEqual([
      { book: 5, titleSnapshot: "Florian Gulli et Jean Quétier, Découvrir Marx", isbnSnapshot: "9782000000000", quantity: 2, unitPriceTTC: 12 },
    ]);
    expect(result.qtyAnomalies).toEqual([]);
  });

  it("qty 0/vide → 1 + anomalie signalée", () => {
    const index = buildIndex({ books: [] });
    const lines: WooLineItemInput[] = [
      { orderItemId: 1, productId: 1, orderItemName: "Produit X", qty: "0", lineSubtotal: "10" },
      { orderItemId: 2, productId: 2, orderItemName: "Produit Y", qty: "", lineSubtotal: "10" },
    ];
    const result = buildOrderLines(lines, index, -1);
    expect(result.lines.map((l) => l.quantity)).toEqual([1, 1]);
    expect(result.qtyAnomalies).toHaveLength(2);
  });

  it("bucket 'repli' route vers l'id de la fiche de repli fournie par l'appelant", () => {
    const index = buildIndex({ books: [] });
    const lines: WooLineItemInput[] = [
      { orderItemId: 1, productId: 12345, orderItemName: "Article boutique disparu", qty: "1", lineSubtotal: "5" },
    ];
    const result = buildOrderLines(lines, index, 777);
    expect(result.lines[0].book).toBe(777);
    expect(result.lines[0].isbnSnapshot).toBeNull();
    expect(result.productBuckets).toEqual([{ productId: 12345, bucket: "repli", bookId: null }]);
  });
});

/* ─────────────────────────── orderType ─────────────────────────── */

describe("computeOrderType", () => {
  it("aucune ligne précommande → commande", () => {
    expect(computeOrderType([1, 2, 3])).toEqual({ orderType: "commande", mixed: false });
  });
  it("uniquement précommande → precommande, non mixte", () => {
    expect(computeOrderType([PRECOMMANDE_PRODUCT_ID])).toEqual({ orderType: "precommande", mixed: false });
  });
  it("panier mixte (7870 + autres) → precommande, mixte signalé", () => {
    expect(computeOrderType([PRECOMMANDE_PRODUCT_ID, 658, 661])).toEqual({ orderType: "precommande", mixed: true });
  });
});

/* ─────────────────────────── idempotence ─────────────────────────── */

describe("wooStripeSessionId", () => {
  it("stripeSessionId = 'woo-' + ID Woo", () => {
    expect(wooStripeSessionId(153)).toBe("woo-153");
  });
});

/* ─────────────────────────── transformOrder (bout en bout) ─────────────────────────── */

function baseOrder(overrides: Partial<WooOrderInput> = {}): WooOrderInput {
  return {
    id: 153,
    postStatus: "wc-completed",
    postDate: "2018-03-14 21:47:48",
    postDateGmt: "2018-03-14 20:47:48",
    billing: address(),
    shipping: address(),
    billingEmail: "cobalt55@hotmail.com",
    orderShipping: "0.00",
    cartDiscount: "0",
    orderTotal: "100.00",
    datePaid: "1521060584",
    paidDate: "2018-03-14 21:49:44",
    lines: [
      {
        orderItemId: 35,
        productId: 36,
        orderItemName:
          "Le Capital de Karl Marx, Livre 1, fac-similé de la première édition française de 1875. Souscription avant parution.",
        qty: "1",
        lineSubtotal: "100",
      },
    ],
    shippingLabel: "Livraison gratuite",
    ...overrides,
  };
}

describe("transformOrder — commande réaliste complète (dump réel, id 153)", () => {
  it("produit un payload de création cohérent", () => {
    const target = book({ id: 42, slug: "le-capital-livre-1", title: "Le Capital de Karl Marx, Livre 1" });
    const index = buildIndex({
      products: [{ id: 36, slug: "le-capital-livre-1-facsimile", title: "Le Capital de Karl Marx, Livre 1, fac-similé" }],
      books: [target],
    });
    const result = transformOrder(baseOrder(), index, -1);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.data).toMatchObject({
      number: "153",
      orderType: "commande",
      status: "shipped",
      email: "cobalt55@hotmail.com",
      shippingMethod: "offert",
      shippingCostTTC: 0,
      discountTTC: 0,
      totalTTC: 100,
      stripeSessionId: "woo-153",
      stripePaymentIntentId: null,
      createdAt: "2018-03-14T20:47:48.000Z",
      stockDecremented: true,
      confirmationSent: true,
    });
    expect(result.data.paidAt).toBe(new Date(1521060584 * 1000).toISOString());
    expect(result.flags.arithmeticMismatch).toBe(false);
  });

  it("statut inattendu → exclusion motivée", () => {
    const index = buildIndex({ books: [] });
    const result = transformOrder(baseOrder({ postStatus: "wc-pending" }), index, -1);
    expect(result).toEqual({ kind: "excluded", wooId: 153, reason: "statut Woo inattendu : wc-pending" });
  });

  it("commande mixte précommande + autre livre → orderType precommande, mixedPrecommande=true", () => {
    const index = buildIndex({
      products: [{ id: PRECOMMANDE_PRODUCT_ID, slug: "etat-et-revolution-citoyenne", title: "PRÉCOMMANDE" }],
      books: [ETAT_ET_REVOLUTION, book({ id: 658, slug: "decouvrir-marx", title: "Découvrir Marx" })],
    });
    const order = baseOrder({
      id: 8046,
      lines: [
        { orderItemId: 1, productId: PRECOMMANDE_PRODUCT_ID, orderItemName: "PRÉCOMMANDE", qty: "1", lineSubtotal: "18" },
        { orderItemId: 2, productId: 658, orderItemName: "Découvrir Marx", qty: "1", lineSubtotal: "12" },
      ],
      orderTotal: "30",
    });
    const result = transformOrder(order, index, -1);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.data.orderType).toBe("precommande");
    expect(result.flags.mixedPrecommande).toBe(true);
  });
});

/* ─────────────────────────── rapports ─────────────────────────── */

describe("buildProductMappingReport", () => {
  it("agrège par (produit, bucket, fiche) avec nb de lignes", () => {
    const index = buildIndex({
      products: [{ id: 1, slug: "a", title: "A" }],
      books: [book({ id: 1, slug: "a", title: "A" })],
    });
    const report = buildProductMappingReport(
      [
        { productId: 1, bucket: "slug-direct", bookId: 1 },
        { productId: 1, bucket: "slug-direct", bookId: 1 },
      ],
      index,
    );
    expect(report).toEqual([{ productId: 1, productTitle: "A", bucket: "slug-direct", bookId: 1, bookSlug: "a", lineCount: 2 }]);
  });
});

describe("aggregateImportReport", () => {
  it("tallies statuts/orderType/sommes/réparations/exclusions", () => {
    const index = buildIndex({ books: [] });
    const ok1 = transformOrder(baseOrder({ id: 1 }), index, -1);
    const ok2 = transformOrder(baseOrder({ id: 2, postStatus: "wc-cancelled", orderTotal: "0", cartDiscount: "0", orderShipping: "0" }), index, -1);
    const excluded = transformOrder(baseOrder({ id: 3, postStatus: "wc-unknown" }), index, -1);
    const report = aggregateImportReport([ok1, ok2, excluded]);
    expect(report.totalOrders).toBe(3);
    expect(report.created).toBe(2);
    expect(report.excluded).toBe(1);
    expect(report.exclusions).toEqual([{ wooId: 3, reason: "statut Woo inattendu : wc-unknown" }]);
    expect(report.byStatus.shipped).toBe(1);
    expect(report.byStatus.cancelled).toBe(1);
  });
});
