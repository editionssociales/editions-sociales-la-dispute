import { describe, expect, it } from "vitest";
import { lexicalToHtml, payloadBookToRawBook } from "./catalogue-pg-map";
import type { Author, Book as PayloadBook, Libelle, Media } from "../payload-types";

/* -------- fixtures -------- */

// La forme exacte du type Lexical généré (`PayloadBook["presentation"]`) est
// volontairement large (`{ [k: string]: unknown; ... }`) — on construit la
// fixture en JS brut et on ne la type qu'au moment de l'assigner (`as const`
// sur les littéraux `direction`/`format` évite l'élargissement en `string`).
function lexicalDoc(text: string) {
  return {
    root: {
      type: "root",
      format: "" as const,
      indent: 0,
      version: 1,
      direction: "ltr" as const,
      children: [
        {
          type: "paragraph",
          format: "" as const,
          indent: 0,
          version: 1,
          direction: "ltr" as const,
          children: [
            { type: "text", format: 0, style: "", mode: "normal", detail: 0, text, version: 1 },
          ],
        },
      ],
    },
  };
}

const AUTHOR: Author = {
  id: 1,
  name: "Karl Marx",
  slug: "marx",
  updatedAt: "",
  createdAt: "",
};

const LIBELLE: Libelle = {
  id: 1,
  name: "GEME",
  slug: "geme",
  updatedAt: "",
  createdAt: "",
};

const COVER: Media = {
  id: 1,
  url: "https://blob.example/cover.jpg",
  width: 400,
  height: 600,
  updatedAt: "",
  createdAt: "",
};

const TABLE_PDF: Media = {
  id: 2,
  url: "https://blob.example/table.pdf",
  updatedAt: "",
  createdAt: "",
};

/** Fiche de base complète — chaque test ne dévie que des champs qui l'intéressent. */
function book(overrides: Partial<PayloadBook> = {}): PayloadBook {
  return {
    id: 42,
    title: "Le Capital",
    slug: "capital",
    edition: "editions-sociales",
    origin: "catalogue",
    presentation: lexicalDoc("Présentation Lexical"),
    presentationLegacyHtml: "<p>Présentation WordPress</p>",
    plusLoin: null,
    plusLoinLegacyHtml: null,
    contentTouched: false,
    isbn: "978-2-35367-000-0",
    prix: 20.5,
    pages: 320,
    dateParution: "2020-03-01T00:00:00.000Z",
    sortDate: "2020-03-01T00:00:00.000Z",
    aParaitre: false,
    authors: [AUTHOR],
    libelles: [LIBELLE],
    cover: COVER,
    tablePdf: TABLE_PDF,
    extraitPdf: null,
    buy: {
      boutiqueUrl: "https://boutique.editionssociales.fr/produit/capital/",
      parislibrairies: "https://parislibrairies.fr/capital",
      lalibrairie: null,
    },
    updatedAt: "",
    createdAt: "",
    _status: "published",
    ...overrides,
  };
}

describe("payloadBookToRawBook — mapping droit, sans enveloppe WordPress", () => {
  it("mappe une fiche complète (auteurs, libellés, cover, PDF, liens d'achat)", () => {
    const raw = payloadBookToRawBook(book());

    expect(raw.id).toBe(42);
    expect(raw.slug).toBe("capital");
    expect(raw.title).toBe("Le Capital");
    expect(raw.isbn).toBe("978-2-35367-000-0");
    expect(raw.authors).toEqual([{ name: "Karl Marx", slug: "marx" }]);
    expect(raw.libelles).toEqual([{ name: "GEME", slug: "geme" }]);
    expect(raw.cover).toEqual({
      url: "https://blob.example/cover.jpg",
      width: 400,
      height: 600,
    });
    expect(raw.tocUrl).toBe("https://blob.example/table.pdf");
    expect(raw.excerptUrl).toBeNull();
    expect(raw.buy.boutique).toBe("https://boutique.editionssociales.fr/produit/capital/");
    expect(raw.buy.parislibrairies).toBe("https://parislibrairies.fr/capital");
    expect(raw.buy.lalibrairie).toBeNull();
  });

  it("renvoie le prix tel quel — nombre déjà propre, plus de boxing string|number", () => {
    const raw = payloadBookToRawBook(book({ prix: 9.99 }));
    expect(raw.price).toBe(9.99);
  });

  it("normalise la date de parution Payload (ISO horodatée) en jour `YYYY-MM-DD`", () => {
    const raw = payloadBookToRawBook(book({ dateParution: "2024-05-01T00:00:00.000Z" }));
    expect(raw.publishedAt).toBe("2024-05-01");
  });

  it("sert le HTML legacy tant que contentTouched=false, même si un Lexical existe déjà", () => {
    const raw = payloadBookToRawBook(
      book({
        contentTouched: false,
        presentationLegacyHtml: "<p>Présentation WordPress</p>",
        presentation: lexicalDoc("Présentation Lexical"),
      }),
    );
    expect(raw.presentationHtml).toBe("<p>Présentation WordPress</p>");
  });

  it("sert le Lexical converti dès que contentTouched=true (fiche rééditée)", () => {
    const raw = payloadBookToRawBook(
      book({
        contentTouched: true,
        presentationLegacyHtml: "<p>Présentation WordPress</p>",
        presentation: lexicalDoc("Présentation Lexical"),
      }),
    );
    expect(raw.presentationHtml).toBe("<p>Présentation Lexical</p>");
  });

  it("replie sur l'autre source si celle attendue est vide (jamais de contenu perdu)", () => {
    // Fiche créée dans Payload (contentTouched=true) mais sans legacy — le Lexical
    // est bien la source ; symétriquement une fiche migrée dont le Lexical serait
    // vide retomberait sur le legacy.
    const raw = payloadBookToRawBook(
      book({
        contentTouched: true,
        presentationLegacyHtml: null,
        presentation: lexicalDoc("Contenu neuf"),
      }),
    );
    expect(raw.presentationHtml).toBe("<p>Contenu neuf</p>");
  });

  it("plus_loin : null quand ni legacy ni Lexical n'ont de contenu", () => {
    const raw = payloadBookToRawBook(book({ plusLoin: null, plusLoinLegacyHtml: null }));
    expect(raw.furtherReadingHtml).toBeNull();
  });

  it("plus_loin : legacy servi tant que contentTouched=false", () => {
    const raw = payloadBookToRawBook(
      book({
        contentTouched: false,
        plusLoinLegacyHtml: "<p>Voir aussi</p>",
        plusLoin: lexicalDoc("Voir aussi (Lexical)"),
      }),
    );
    expect(raw.furtherReadingHtml).toBe("<p>Voir aussi</p>");
  });

  it("gère une fiche sans wpSource (née dans Payload) sans dévier du mapping", () => {
    const raw = payloadBookToRawBook(book({ wpSource: undefined }));
    expect(raw.id).toBe(42);
    expect(raw.slug).toBe("capital");
    expect(raw.authors).toEqual([{ name: "Karl Marx", slug: "marx" }]);
  });

  it("tolère authors/libelles/cover absents", () => {
    const raw = payloadBookToRawBook(
      book({ authors: null, libelles: null, cover: null, tablePdf: null, extraitPdf: null }),
    );
    expect(raw.authors).toEqual([]);
    expect(raw.libelles).toEqual([]);
    expect(raw.cover).toBeNull();
    expect(raw.tocUrl).toBeNull();
    expect(raw.excerptUrl).toBeNull();
  });
});

describe("lexicalToHtml", () => {
  it("rend un paragraphe simple", () => {
    expect(lexicalToHtml(lexicalDoc("Bonjour"))).toBe("<p>Bonjour</p>");
  });

  it("renvoie une chaîne vide pour une donnée absente ou invalide", () => {
    expect(lexicalToHtml(null)).toBe("");
    expect(lexicalToHtml(undefined)).toBe("");
    expect(lexicalToHtml("pas un objet lexical")).toBe("");
  });
});

describe("payloadBookToRawBook — commerce natif (groupe `commerce`)", () => {
  it("mappe sellable/stock tels quels quand le groupe est présent", () => {
    const raw = payloadBookToRawBook(
      book({ commerce: { sellable: true, stock: 5, reducedShippingFlag: false } }),
    );
    expect(raw.commerce).toEqual({ sellable: true, stock: 5, preorder: false });
  });

  it("stock absent (non suivi) → null, jamais 0 ni undefined", () => {
    const raw = payloadBookToRawBook(book({ commerce: { sellable: true } }));
    expect(raw.commerce).toEqual({ sellable: true, stock: null, preorder: false });
  });

  it("stock à 0 est préservé (épuisé) — pas confondu avec « non suivi »", () => {
    const raw = payloadBookToRawBook(book({ commerce: { sellable: true, stock: 0 } }));
    expect(raw.commerce).toEqual({ sellable: true, stock: 0, preorder: false });
  });

  it("sellable absent → false (jamais vendable par défaut)", () => {
    const raw = payloadBookToRawBook(book({ commerce: { stock: 10 } }));
    expect(raw.commerce).toEqual({ sellable: false, stock: 10, preorder: false });
  });

  it("preorder coché → reporté tel quel (« Ouvert à la précommande »)", () => {
    const raw = payloadBookToRawBook(book({ commerce: { sellable: true, stock: 5, preorder: true } }));
    expect(raw.commerce).toEqual({ sellable: true, stock: 5, preorder: true });
  });

  it("groupe `commerce` absent (fiche jamais touchée par la migration commerce) → null", () => {
    const raw = payloadBookToRawBook(book({ commerce: undefined }));
    expect(raw.commerce).toBeNull();
  });
});
