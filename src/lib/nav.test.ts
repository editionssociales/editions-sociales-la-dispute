import { describe, expect, it } from "vitest";
import { activeSections, maisonMonogramName } from "./nav";

function search(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

describe("activeSections", () => {
  it("allume les quatre sections sur l'accueil", () => {
    expect(activeSections("/")).toEqual({
      catalogue: true,
      geme: true,
      "a-paraitre": true,
      agenda: true,
    });
  });

  it("allume Catalogue sur le fonds ES sans facette Geme", () => {
    const a = activeSections("/catalogue/editions-sociales");
    expect(a.catalogue).toBe(true);
    expect(a.geme).toBe(false);
  });

  it("allume La GEME seulement avec libelle=geme", () => {
    const a = activeSections("/catalogue/editions-sociales", search("libelle=geme"));
    expect(a.geme).toBe(true);
    expect(a.catalogue).toBe(false);
  });

  it("allume À paraître sur /catalogue?upcoming=1", () => {
    const a = activeSections("/catalogue", search("upcoming=1"));
    expect(a["a-paraitre"]).toBe(true);
    expect(a.catalogue).toBe(false);
  });

  it("allume Catalogue sur /catalogue sans upcoming", () => {
    const a = activeSections("/catalogue");
    expect(a.catalogue).toBe(true);
    expect(a["a-paraitre"]).toBe(false);
  });

  it("allume Agenda sur /rencontres", () => {
    expect(activeSections("/rencontres").agenda).toBe(true);
  });
});

describe("maisonMonogramName — WCAG 2.5.3 Label in Name", () => {
  it("inclut le sigle visible dans le nom accessible, puis le nom complet", () => {
    expect(maisonMonogramName("LD", "La Dispute")).toBe("LD — La Dispute");
    expect(maisonMonogramName("ES", "Les Éditions sociales")).toBe(
      "ES — Les Éditions sociales",
    );
  });
});
