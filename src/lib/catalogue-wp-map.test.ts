import { describe, expect, it } from "vitest";
import { wpBookToRawBook, type WpBook } from "./catalogue-wp-map";

/**
 * Le dialecte du fil REST WordPress, absorbé derrière l'adaptateur : entités
 * HTML, auteurs `Nom/Prénom`, chaînes ACF sales, dates `JJ/MM/AAAA`, URLs
 * http, couverture string de l'ancien mu-plugin, rebase cms-*.
 */

function wpBook(overrides: Partial<WpBook> = {}): WpBook {
  return { id: 1, slug: "capital", title: { rendered: "Le Capital" }, ...overrides };
}

describe("wpBookToRawBook — dialecte WordPress", () => {
  it("décode les entités HTML du titre (l'orthotypo reste en aval, dans le cœur)", () => {
    const raw = wpBookToRawBook(wpBook({ title: { rendered: "L&#8217;Idéologie" } }));
    expect(raw.title).toBe("L’Idéologie");
  });

  it("restitue les auteurs `Nom/Prénom` en forme d'affichage", () => {
    const raw = wpBookToRawBook(
      wpBook({ book: { authors: [{ name: "Marx/Karl", slug: "marx" }] } }),
    );
    expect(raw.authors).toEqual([{ name: "Karl Marx", slug: "marx" }]);
  });

  it("parse les nombres ACF sales (prix en chaîne, virgule décimale)", () => {
    const raw = wpBookToRawBook(wpBook({ book: { prix: "12,50 €", pages: "320 p." } }));
    expect(raw.price).toBe(12.5);
    expect(raw.pages).toBe(320);
  });

  it("prix numérique et prix vide passent aussi", () => {
    expect(wpBookToRawBook(wpBook({ book: { prix: 20 } })).price).toBe(20);
    expect(wpBookToRawBook(wpBook({ book: { prix: "" } })).price).toBeNull();
  });

  it("normalise la parution `JJ/MM/AAAA` (ACF) en ISO", () => {
    const raw = wpBookToRawBook(wpBook({ book: { date_parution: "01/03/2020" } }));
    expect(raw.publishedAt).toBe("2020-03-01");
  });

  it("force https et transporte présentation/plus loin en HTML brut (sanitisation en aval)", () => {
    const raw = wpBookToRawBook(
      wpBook({
        content: { rendered: "<p>Présentation</p>" },
        book: { plus_loin: "<p>Voir aussi</p>", table: "http://medias.ovh/toc.pdf" },
      }),
    );
    expect(raw.presentationHtml).toBe("<p>Présentation</p>");
    expect(raw.furtherReadingHtml).toBe("<p>Voir aussi</p>");
    expect(raw.tocUrl).toBe("https://medias.ovh/toc.pdf");
  });

  it("liste sans `content` (usage prod) → presentationHtml null", () => {
    expect(wpBookToRawBook(wpBook()).presentationHtml).toBeNull();
  });
});

describe("wpBookToRawBook — couvertures (découplage CMS, E3)", () => {
  it("rebase une couverture {url,width,height} sur editionssociales.fr vers cms-es", () => {
    const raw = wpBookToRawBook(
      wpBook({
        book: {
          cover: {
            url: "https://editionssociales.fr/wp-content/uploads/couv.jpg",
            width: 400,
            height: 600,
          },
        },
      }),
    );
    expect(raw.cover).toEqual({
      url: "https://cms-es.editionssociales.fr/wp-content/uploads/couv.jpg",
      width: 400,
      height: 600,
    });
  });

  it("rebase une couverture sur ladispute.fr vers cms-ld", () => {
    const raw = wpBookToRawBook(
      wpBook({
        book: {
          cover: { url: "http://ladispute.fr/wp-content/uploads/couv.jpg", width: 400, height: 600 },
        },
      }),
    );
    expect(raw.cover?.url).toBe("https://cms-ld.editionssociales.fr/wp-content/uploads/couv.jpg");
  });

  it("rebase l'ancienne forme string de couverture (avant redéploiement du mu-plugin)", () => {
    const raw = wpBookToRawBook(
      wpBook({ book: { cover: "https://www.editionssociales.fr/wp-content/uploads/couv.jpg" } }),
    );
    expect(raw.cover).toEqual({
      url: "https://cms-es.editionssociales.fr/wp-content/uploads/couv.jpg",
      width: 2,
      height: 3,
    });
  });

  it("laisse inchangée une couverture qui ne matche aucun des deux domaines historiques", () => {
    const raw = wpBookToRawBook(
      wpBook({
        book: {
          cover: {
            url: "https://boutique.editionssociales.fr/wp-content/uploads/couv.jpg",
            width: 400,
            height: 600,
          },
        },
      }),
    );
    expect(raw.cover?.url).toBe("https://boutique.editionssociales.fr/wp-content/uploads/couv.jpg");
  });

  it("couverture absente ou aux dimensions invalides → null", () => {
    expect(wpBookToRawBook(wpBook()).cover).toBeNull();
    expect(
      wpBookToRawBook(
        wpBook({ book: { cover: { url: "https://x.test/c.jpg", width: 0, height: 600 } } }),
      ).cover,
    ).toBeNull();
  });
});
