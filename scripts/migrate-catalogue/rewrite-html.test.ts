import { describe, expect, it } from "vitest";
import { prepareHtmlForLexical, rewriteHtmlUrls, rewriteInternalLinks } from "./rewrite-html.ts";

describe("rewriteHtmlUrls", () => {
  it("remplace chaque occurrence littérale d'une clé de urlMap par sa valeur", () => {
    const urlMap = new Map([
      ["https://editionssociales.fr/wp-content/uploads/couv.jpg", "/api/media/file/1-couv.jpg"],
    ]);
    const html = '<img src="https://editionssociales.fr/wp-content/uploads/couv.jpg">';
    expect(rewriteHtmlUrls(html, urlMap)).toBe('<img src="/api/media/file/1-couv.jpg">');
  });

  it("laisse html null/undefined inchangé", () => {
    const urlMap = new Map([["a", "b"]]);
    expect(rewriteHtmlUrls(null, urlMap)).toBeNull();
    expect(rewriteHtmlUrls(undefined, urlMap)).toBeNull();
  });

  it("laisse html vide ou urlMap vide inchangés (retourne le html tel quel)", () => {
    expect(rewriteHtmlUrls("", new Map([["a", "b"]]))).toBe("");
    expect(rewriteHtmlUrls("<p>x</p>", new Map())).toBe("<p>x</p>");
  });

  it("ignore les entrées from===to ou vides de la map", () => {
    const urlMap = new Map([
      ["", "x"],
      ["identique", "identique"],
      ["z", "w"],
    ]);
    expect(rewriteHtmlUrls("z-identique", urlMap)).toBe("w-identique");
  });
});

describe("prepareHtmlForLexical", () => {
  it("annote les <img> dont le src correspond à un média migré", () => {
    const mediaIdByUrl = new Map([["/api/media/file/1-couv.jpg", 42]]);
    const { html, removedImgs } = prepareHtmlForLexical('<img src="/api/media/file/1-couv.jpg">', mediaIdByUrl);
    expect(html).toContain('data-lexical-upload-id="42"');
    expect(html).toContain('data-lexical-upload-relation-to="media"');
    expect(removedImgs).toEqual([]);
  });

  it("retire un <img> sans média Payload correspondant", () => {
    const { html, removedImgs } = prepareHtmlForLexical('<img src="/inconnu.jpg">', new Map());
    expect(html).toBe("");
    expect(removedImgs).toEqual(["/inconnu.jpg"]);
  });

  it("garde un lien interne /api/media/file/ sans % ni espace", () => {
    const { html, unwrappedLinks } = prepareHtmlForLexical(
      '<a href="/api/media/file/1-toc.pdf">TdM</a>',
      new Map(),
    );
    expect(html).toBe('<a href="/api/media/file/1-toc.pdf">TdM</a>');
    expect(unwrappedLinks).toEqual([]);
  });

  it("déballe un href invalide (ex. citation collée par erreur)", () => {
    const { html, unwrappedLinks } = prepareHtmlForLexical('<a href="http://Zoé Rollin">Zoé Rollin</a>', new Map());
    expect(html).toBe("Zoé Rollin");
    expect(unwrappedLinks).toEqual(["http://Zoé Rollin"]);
  });

  it("garde un href absolu http(s)/mailto/tel valide", () => {
    const { html, unwrappedLinks } = prepareHtmlForLexical(
      '<a href="https://example.test/article">Article</a>',
      new Map(),
    );
    expect(html).toBe('<a href="https://example.test/article">Article</a>');
    expect(unwrappedLinks).toEqual([]);
  });

  it("garde un lien interne vers une fiche catalogue posé par rewriteInternalLinks (E11)", () => {
    const { html, unwrappedLinks } = prepareHtmlForLexical(
      '<a href="/catalogue/editions-sociales/le-travail-et-la-liberte">Le travail et la liberté</a>',
      new Map(),
    );
    expect(html).toBe('<a href="/catalogue/editions-sociales/le-travail-et-la-liberte">Le travail et la liberté</a>');
    expect(unwrappedLinks).toEqual([]);
  });

  it("garde un lien interne vers la racine posé par rewriteInternalLinks (E11)", () => {
    const { html, unwrappedLinks } = prepareHtmlForLexical('<a href="/">Accueil</a>', new Map());
    expect(html).toBe('<a href="/">Accueil</a>');
    expect(unwrappedLinks).toEqual([]);
  });

  it("déballe toujours un relatif hors /api/media/file et hors /catalogue/<edition>/<slug>", () => {
    const { html, unwrappedLinks } = prepareHtmlForLexical('<a href="/mentions-legales">Mentions</a>', new Map());
    expect(html).toBe("Mentions");
    expect(unwrappedLinks).toEqual(["/mentions-legales"]);
  });
});

describe("rewriteInternalLinks — E11, liens internes de corps de texte", () => {
  it("réécrit un lien /catalogue/<slug> vers editions-sociales en lien interne", () => {
    const html = '<a href="https://editionssociales.fr/catalogue/le-travail-et-la-liberte/">Le travail et la liberté</a>';
    const { html: out, unwrappedLinks } = rewriteInternalLinks(html);
    expect(out).toBe('<a href="/catalogue/editions-sociales/le-travail-et-la-liberte">Le travail et la liberté</a>');
    expect(unwrappedLinks).toEqual([]);
  });

  it("réécrit un lien /catalogue/<slug> vers ladispute.fr en lien interne la-dispute", () => {
    const html = '<a href="http://ladispute.fr/catalogue/jeunes-jolies-et-sous-traitees/">Voir aussi</a>';
    const { html: out } = rewriteInternalLinks(html);
    expect(out).toBe('<a href="/catalogue/la-dispute/jeunes-jolies-et-sous-traitees">Voir aussi</a>');
  });

  it("accepte www. en préfixe", () => {
    const html = '<a href="https://www.editionssociales.fr/catalogue/decouvrir-marx/">Marx</a>';
    const { html: out } = rewriteInternalLinks(html);
    expect(out).toBe('<a href="/catalogue/editions-sociales/decouvrir-marx">Marx</a>');
  });

  it("réduit un sous-chemin de page d'attachement WordPress au slug parent (même fiche)", () => {
    // Cas réel constaté : `<slug>/attachment/2/`, `<slug>/le-monde-2/` — pages
    // de pièce jointe WP pour une image incorporée, pas des pages du nouveau site.
    const html = '<a href="https://editionssociales.fr/catalogue/decouvrir-lantifascisme/le-monde-2/">Le Monde</a>';
    const { html: out } = rewriteInternalLinks(html);
    expect(out).toBe('<a href="/catalogue/editions-sociales/decouvrir-lantifascisme">Le Monde</a>');
  });

  it("réduit un sous-chemin littéral /attachment/<id>/ au slug parent", () => {
    const html =
      '<a href="https://editionssociales.fr/catalogue/les-romantiques-langleterre-a-lere-des-revolutions/attachment/2/">img</a>';
    const { html: out } = rewriteInternalLinks(html);
    expect(out).toBe(
      '<a href="/catalogue/editions-sociales/les-romantiques-langleterre-a-lere-des-revolutions">img</a>',
    );
  });

  it("réécrit la racine nue du domaine vers /", () => {
    const html = '<a href="https://editionssociales.fr/">Accueil</a>';
    const { html: out } = rewriteInternalLinks(html);
    expect(out).toBe('<a href="/">Accueil</a>');
  });

  it("réécrit une racine avec query non résoluble (ex. ?attachment_id=482) vers / (pathname nu)", () => {
    const html = '<a href="http://editionssociales.fr/?attachment_id=482">Photo</a>';
    const { html: out, unwrappedLinks } = rewriteInternalLinks(html);
    expect(out).toBe('<a href="/">Photo</a>');
    expect(unwrappedLinks).toEqual([]);
  });

  it("déballe un lien vers un des deux domaines historiques hors catalogue/racine", () => {
    const html = '<a href="https://editionssociales.fr/actualites/quelque-chose">Actu</a>';
    const { html: out, unwrappedLinks } = rewriteInternalLinks(html);
    expect(out).toBe("Actu");
    expect(unwrappedLinks).toEqual(["https://editionssociales.fr/actualites/quelque-chose"]);
  });

  it("laisse inchangé un lien absolu vers un tiers (ni editionssociales.fr ni ladispute.fr)", () => {
    const html = '<a href="https://lanticapitaliste.org/article">Recension</a>';
    const { html: out, unwrappedLinks } = rewriteInternalLinks(html);
    expect(out).toBe(html);
    expect(unwrappedLinks).toEqual([]);
  });

  it("laisse inchangé un lien href non-URL (relatif hors /api/media, invalide)", () => {
    const html = '<a href="/mentions-legales">Mentions légales</a>';
    const { html: out } = rewriteInternalLinks(html);
    expect(out).toBe(html);
  });

  it("laisse inchangé un <a> sans href", () => {
    const html = "<a>texte sans lien</a>";
    const { html: out } = rewriteInternalLinks(html);
    expect(out).toBe(html);
  });

  it("laisse intact le domaine boutique.editionssociales.fr (hors périmètre)", () => {
    const html = '<a href="https://boutique.editionssociales.fr/produit/x/">Acheter</a>';
    const { html: out } = rewriteInternalLinks(html);
    expect(out).toBe(html);
  });
});
