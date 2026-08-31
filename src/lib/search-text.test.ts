import { describe, expect, it } from "vitest";
import {
  findToken,
  foldSearchText,
  foldSearchTextWithMap,
  highlightRanges,
  matchesSearchQuery,
  tokenizeSearchQuery,
} from "./search-text";

describe("foldSearchText", () => {
  it("plie casse et diacritiques", () => {
    expect(foldSearchText("État")).toBe("etat");
    expect(foldSearchText("Révolution française")).toBe("revolution francaise");
  });

  it("plie les ligatures œ/æ, hors de portée de NFD", () => {
    expect(foldSearchText("Œuvres")).toBe("oeuvres");
    expect(foldSearchText("cæcum")).toBe("caecum");
  });

  it("plie l'apostrophe typographique vers la droite du clavier", () => {
    expect(foldSearchText("L’Idéologie")).toBe("l'ideologie");
  });

  it("plie les insécables que frenchTypo insère dans les titres", () => {
    // NNBSP avant « ! », NBSP avant « : » — la frappe utilisateur, elle,
    // tape une espace ordinaire.
    expect(foldSearchText("Vive la Commune !")).toBe("vive la commune !");
    expect(foldSearchText("Marx : une vie")).toBe("marx : une vie");
  });
});

describe("tokenizeSearchQuery", () => {
  it("découpe sur les blancs, plie, écarte le vide", () => {
    expect(tokenizeSearchQuery("  Marx   État ")).toEqual(["marx", "etat"]);
    expect(tokenizeSearchQuery("   ")).toEqual([]);
  });

  it("borne à 8 jetons", () => {
    expect(tokenizeSearchQuery("a b c d e f g h i j")).toHaveLength(8);
  });
});

describe("findToken", () => {
  it("préfère l'occurrence en début de mot, où qu'elle soit", () => {
    expect(findToken("le capital", "cap")).toEqual({ index: 3, atWordStart: true });
    // « ta » n'ouvre aucun mot : première occurrence brute.
    expect(findToken("le capital", "ta")).toEqual({ index: 7, atWordStart: false });
  });

  it("l'apostrophe est une frontière de mot", () => {
    expect(findToken("l'ideologie", "ideologie")).toEqual({ index: 2, atWordStart: true });
  });

  it("un jeton d'un caractère n'apparie qu'en début de mot", () => {
    expect(findToken("le capital", "l")).toEqual({ index: 0, atWordStart: true });
    expect(findToken("le capital", "a")).toBeNull();
  });

  it("absent : null", () => {
    expect(findToken("le capital", "engels")).toBeNull();
  });
});

describe("matchesSearchQuery", () => {
  const fields = ["Le Capital", "Karl Marx", "GEME"];

  it("chaque jeton doit se retrouver dans au moins un champ", () => {
    expect(matchesSearchQuery(fields, "marx capital")).toBe(true);
    expect(matchesSearchQuery(fields, "marx engels")).toBe(false);
  });

  it("plie la frappe comme les champs", () => {
    expect(matchesSearchQuery(["L’Idéologie"], "IDEOLOGIE")).toBe(true);
    expect(matchesSearchQuery(["État et révolution"], "etat")).toBe(true);
  });

  it("requête vide ou blanche : tout passe", () => {
    expect(matchesSearchQuery(fields, "")).toBe(true);
    expect(matchesSearchQuery(fields, "   ")).toBe(true);
  });
});

describe("foldSearchTextWithMap + highlightRanges", () => {
  it("les plages pointent la chaîne d'origine, à travers accents et ligatures", () => {
    const title = "Œuvres complètes";
    const ranges = highlightRanges(foldSearchTextWithMap(title), ["oeuvres"]);
    expect(ranges).toEqual([{ start: 0, end: 6 }]);
    expect(title.slice(0, 6)).toBe("Œuvres");
  });

  it("fusionne les plages qui se chevauchent, en ordre de texte", () => {
    const title = "Idéologie";
    const ranges = highlightRanges(foldSearchTextWithMap(title), ["olog", "ideo"]);
    expect(ranges).toEqual([{ start: 0, end: 7 }]);
    expect(title.slice(0, 7)).toBe("Idéolog");
  });

  it("un jeton introuvable ne produit aucune plage", () => {
    expect(highlightRanges(foldSearchTextWithMap("Le Capital"), ["engels"])).toEqual([]);
  });
});
