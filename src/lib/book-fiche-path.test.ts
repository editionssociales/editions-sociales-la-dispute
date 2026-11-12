import { describe, expect, it } from "vitest";
import { bookFichePath } from "./book-fiche-path";

describe("bookFichePath", () => {
  it("fonds : /catalogue/<maison>/<slug>", () => {
    expect(bookFichePath({ slug: "a", edition: "la-dispute", origin: "catalogue" })).toBe("/catalogue/la-dispute/a");
  });
  it("boutique-seul : /boutique/<slug>", () => {
    expect(bookFichePath({ slug: "a", edition: null, origin: "boutique" })).toBe("/boutique/a");
  });
  it("sans slug ou sans chemin public : null", () => {
    expect(bookFichePath({ slug: "", edition: "la-dispute" })).toBeNull();
    expect(bookFichePath({ slug: "a", edition: null, origin: "catalogue" })).toBeNull();
  });
});
