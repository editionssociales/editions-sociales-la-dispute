import { describe, expect, it } from "vitest";
import { slugFromBoutiqueLink } from "./catalogue-source";

/**
 * `slugFromBoutiqueLink` — extraction pure du slug produit d'un lien
 * boutique ACF. Cas de base couverts indirectement dans
 * `catalogue-core.test.ts` (résolution `buy.boutique` → produit) ; ici, les
 * cas limites de la version durcie (query string, fragment, slug encodé).
 */
describe("slugFromBoutiqueLink", () => {
  it("extrait le slug d'un lien boutique standard", () => {
    expect(slugFromBoutiqueLink("https://boutique.editionssociales.fr/produit/capital/")).toBe("capital");
  });

  it("renvoie null pour un lien absent", () => {
    expect(slugFromBoutiqueLink(null)).toBeNull();
  });

  it("renvoie null si le lien ne contient pas de segment /produit/", () => {
    expect(slugFromBoutiqueLink("https://boutique.editionssociales.fr/capital/")).toBeNull();
  });

  it("s'arrête à la query string, ne pollue pas le slug", () => {
    expect(
      slugFromBoutiqueLink("https://boutique.editionssociales.fr/produit/capital/?add-to-cart=1"),
    ).toBe("capital");
  });

  it("s'arrête au fragment, ne pollue pas le slug", () => {
    expect(slugFromBoutiqueLink("https://boutique.editionssociales.fr/produit/capital/#avis")).toBe(
      "capital",
    );
  });

  it("décode un slug encodé (accent URL-encodé)", () => {
    expect(
      slugFromBoutiqueLink("https://boutique.editionssociales.fr/produit/id%C3%A9ologie/"),
    ).toBe("idéologie");
  });

  it("tolère une séquence d'encodage invalide sans planter (retombe sur le lien brut)", () => {
    expect(slugFromBoutiqueLink("https://boutique.editionssociales.fr/produit/capital%/")).toBe(
      "capital%",
    );
  });
});
