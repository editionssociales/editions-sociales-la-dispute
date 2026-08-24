import { describe, expect, it } from "vitest";

import { signEbookToken, verifyEbookToken } from "./ebook-token";

const SECRET = "secret-de-test-jamais-celui-de-prod";

describe("signEbookToken / verifyEbookToken", () => {
  it("aller-retour : un jeton fraîchement signé rend la commande et le livre", () => {
    const token = signEbookToken(SECRET, { orderId: 42, bookId: 7 });
    expect(verifyEbookToken(SECRET, token)).toEqual({ orderId: 42, bookId: 7 });
  });

  it("jeton stable — le même achat produit toujours le même lien (rejeu de webhook, renvoi d'e-mail)", () => {
    expect(signEbookToken(SECRET, { orderId: 42, bookId: 7 })).toBe(
      signEbookToken(SECRET, { orderId: 42, bookId: 7 }),
    );
  });

  it("un autre secret ne valide pas (rotation de PAYLOAD_SECRET = révocation de tous les liens)", () => {
    const token = signEbookToken(SECRET, { orderId: 42, bookId: 7 });
    expect(verifyEbookToken("un-autre-secret", token)).toBeNull();
  });

  it("ids modifiés à la main dans l'URL → refusé (la signature couvre les deux)", () => {
    const token = signEbookToken(SECRET, { orderId: 42, bookId: 7 });
    const [, , sig] = token.split(".");
    expect(verifyEbookToken(SECRET, `43.7.${sig}`)).toBeNull();
    expect(verifyEbookToken(SECRET, `42.8.${sig}`)).toBeNull();
  });

  it("ids non canoniques (zéros en tête) → refusé, jamais deux jetons valides pour un même achat", () => {
    const sig = signEbookToken(SECRET, { orderId: 7, bookId: 7 }).split(".")[2];
    expect(verifyEbookToken(SECRET, `007.7.${sig}`)).toBeNull();
  });

  it("formes malformées → null, jamais d'exception", () => {
    for (const token of ["", "n'importe quoi", "42.7", "42.7.sig.extra", "a.b.c", "-1.-7.x", "0.7.x"]) {
      expect(verifyEbookToken(SECRET, token)).toBeNull();
    }
  });

  it("signature tronquée ou rallongée → refusé (comparaison à longueur ET à temps constants)", () => {
    const token = signEbookToken(SECRET, { orderId: 42, bookId: 7 });
    const [order, book, sig] = token.split(".");
    expect(verifyEbookToken(SECRET, `${order}.${book}.${sig.slice(0, -1)}`)).toBeNull();
    expect(verifyEbookToken(SECRET, `${order}.${book}.${sig}A`)).toBeNull();
  });

  it("deux livres d'une même commande ont deux jetons distincts", () => {
    expect(signEbookToken(SECRET, { orderId: 42, bookId: 7 })).not.toBe(
      signEbookToken(SECRET, { orderId: 42, bookId: 8 }),
    );
  });
});
