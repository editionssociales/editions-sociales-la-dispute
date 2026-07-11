import { describe, expect, it } from "vitest";
import { frenchTypo } from "./typo-fr";

const NBSP = " ";
const NNBSP = " ";

describe("frenchTypo", () => {
  it("pose une espace fine insécable avant ! ? ;", () => {
    expect(frenchTypo("Vraiment ?")).toBe(`Vraiment${NNBSP}?`);
    expect(frenchTypo("Incroyable !")).toBe(`Incroyable${NNBSP}!`);
    expect(frenchTypo("Un ; deux")).toBe(`Un${NNBSP}; deux`);
  });

  it("pose une espace insécable avant :", () => {
    expect(frenchTypo("Titre : sous-titre")).toBe(`Titre${NBSP}: sous-titre`);
  });

  it("pose une espace insécable à l'intérieur des guillemets français", () => {
    expect(frenchTypo("« bonjour »")).toBe(`«${NBSP}bonjour${NBSP}»`);
  });

  it("remplace une espace normale existante plutôt que de l'additionner", () => {
    // Idempotence : une deuxième passe ne fait pas grossir l'espace.
    const once = frenchTypo("Vraiment ? « salut » Titre : fin !");
    const twice = frenchTypo(once);
    expect(twice).toBe(once);
  });

  it("ne convertit jamais des guillemets droits en guillemets français (décision Q4)", () => {
    expect(frenchTypo('Il a dit "bonjour"')).toBe('Il a dit "bonjour"');
  });

  it("ne sépare pas deux signes de ponctuation consécutifs (« ?! »)", () => {
    expect(frenchTypo("Quoi ?!")).toBe(`Quoi${NNBSP}?!`);
  });

  it("laisse un texte sans ponctuation concernée inchangé", () => {
    expect(frenchTypo("Le Capital")).toBe("Le Capital");
  });

  it("n'ajoute pas d'espace en tête de chaîne", () => {
    expect(frenchTypo(": début")).toBe(": début");
  });

  it("ne casse pas une URL citée en texte (schéma http(s)://)", () => {
    expect(frenchTypo("Source : http://example.org/ref")).toBe(`Source${NBSP}: http://example.org/ref`);
    expect(frenchTypo("Voir https://example.org/ref")).toBe("Voir https://example.org/ref");
  });
});
