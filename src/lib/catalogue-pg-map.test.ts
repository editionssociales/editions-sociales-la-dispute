import { describe, expect, it } from "vitest";
import { lexicalToHtml, payloadBookToWpBook } from "./catalogue-pg-map";
import type { Author, Book as PayloadBook, Collection, Media } from "../payload-types";

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

const COLLECTION: Collection = {
  id: 1,
  name: "GEME",
  slug: "geme",
  edition: "editions-sociales",
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
    collection: COLLECTION,
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

describe("payloadBookToWpBook", () => {
  it("mappe une fiche complète (auteurs, collection, cover, PDF, liens d'achat)", () => {
    const wp = payloadBookToWpBook(book());

    expect(wp.id).toBe(42);
    expect(wp.slug).toBe("capital");
    expect(wp.title).toEqual({ rendered: "Le Capital" });
    expect(wp.book?.isbn).toBe("978-2-35367-000-0");
    expect(wp.book?.authors).toEqual([{ name: "Karl Marx", slug: "marx" }]);
    expect(wp.book?.collection).toEqual({ name: "GEME", slug: "geme" });
    expect(wp.book?.cover).toEqual({
      url: "https://blob.example/cover.jpg",
      width: 400,
      height: 600,
    });
    expect(wp.book?.table).toBe("https://blob.example/table.pdf");
    expect(wp.book?.extrait).toBeNull();
    expect(wp.book?.boutique).toBe("https://boutique.editionssociales.fr/produit/capital/");
    expect(wp.book?.parislibrairies).toBe("https://parislibrairies.fr/capital");
    expect(wp.book?.lalibrairie).toBeNull();
  });

  it("renvoie le prix décimal en number (le port accepte string|number)", () => {
    const wp = payloadBookToWpBook(book({ prix: 9.99 }));
    expect(wp.book?.prix).toBe(9.99);
  });

  it("renvoie la date de parution telle que stockée (ISO, acceptée par parseWpDate)", () => {
    const wp = payloadBookToWpBook(book({ dateParution: "2024-05-01T00:00:00.000Z" }));
    expect(wp.book?.date_parution).toBe("2024-05-01T00:00:00.000Z");
  });

  it("sert le HTML legacy tant que contentTouched=false, même si un Lexical existe déjà", () => {
    const wp = payloadBookToWpBook(
      book({
        contentTouched: false,
        presentationLegacyHtml: "<p>Présentation WordPress</p>",
        presentation: lexicalDoc("Présentation Lexical"),
      }),
    );
    expect(wp.content?.rendered).toBe("<p>Présentation WordPress</p>");
  });

  it("sert le Lexical converti dès que contentTouched=true (fiche rééditée)", () => {
    const wp = payloadBookToWpBook(
      book({
        contentTouched: true,
        presentationLegacyHtml: "<p>Présentation WordPress</p>",
        presentation: lexicalDoc("Présentation Lexical"),
      }),
    );
    expect(wp.content?.rendered).toBe("<p>Présentation Lexical</p>");
  });

  it("replie sur l'autre source si celle attendue est vide (jamais de contenu perdu)", () => {
    // Fiche créée dans Payload (contentTouched=true) mais sans legacy — le Lexical
    // est bien la source ; symétriquement une fiche migrée dont le Lexical serait
    // vide retomberait sur le legacy.
    const wp = payloadBookToWpBook(
      book({
        contentTouched: true,
        presentationLegacyHtml: null,
        presentation: lexicalDoc("Contenu neuf"),
      }),
    );
    expect(wp.content?.rendered).toBe("<p>Contenu neuf</p>");
  });

  it("plus_loin : null quand ni legacy ni Lexical n'ont de contenu", () => {
    const wp = payloadBookToWpBook(book({ plusLoin: null, plusLoinLegacyHtml: null }));
    expect(wp.book?.plus_loin).toBeNull();
  });

  it("plus_loin : legacy servi tant que contentTouched=false", () => {
    const wp = payloadBookToWpBook(
      book({
        contentTouched: false,
        plusLoinLegacyHtml: "<p>Voir aussi</p>",
        plusLoin: lexicalDoc("Voir aussi (Lexical)"),
      }),
    );
    expect(wp.book?.plus_loin).toBe("<p>Voir aussi</p>");
  });

  it("gère une fiche sans wpSource (née dans Payload) sans dévier du mapping", () => {
    const wp = payloadBookToWpBook(book({ wpSource: undefined }));
    expect(wp.id).toBe(42);
    expect(wp.slug).toBe("capital");
    expect(wp.book?.authors).toEqual([{ name: "Karl Marx", slug: "marx" }]);
  });

  it("tolère authors/collection/cover absents", () => {
    const wp = payloadBookToWpBook(
      book({ authors: null, collection: null, cover: null, tablePdf: null, extraitPdf: null }),
    );
    expect(wp.book?.authors).toEqual([]);
    expect(wp.book?.collection).toBeNull();
    expect(wp.book?.cover).toBeNull();
    expect(wp.book?.table).toBeNull();
    expect(wp.book?.extrait).toBeNull();
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
