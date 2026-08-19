import { describe, expect, it } from "vitest";

import {
  buildMailto,
  CONTACT_EMAIL,
  MAILTO_MAX_LENGTH,
  TRUNCATION_MARK,
} from "./contact-address";

/**
 * Contrat de la source unique de l'adresse publique et du constructeur de
 * liens `mailto:` (`contact-address.ts`) : c'est le repli qui remplace toute
 * la chaîne e-mail quand Brevo n'est pas provisionné — un lien cassé y coûte
 * exactement ce qu'il prétend éviter.
 */
describe("CONTACT_EMAIL — adresse publique", () => {
  it("est la boîte OVH réellement relevée, sur le domaine canonique", () => {
    expect(CONTACT_EMAIL).toBe("ecrire@editionssociales.fr");
  });

  it("n'est JAMAIS sur ladispute.fr — ce domaine n'a aucune boîte", () => {
    expect(CONTACT_EMAIL).not.toMatch(/ladispute\.fr$/);
  });

  it("ne dépend d'aucune variable d'environnement : le repli survit à une configuration vide", () => {
    // Un repli configurable disparaîtrait le jour où la configuration manque —
    // c'est-à-dire exactement le jour où il sert.
    const source = buildMailto();
    expect(source.address).toBe(CONTACT_EMAIL);
  });
});

describe("buildMailto — encodage", () => {
  it("sans objet ni corps : lien nu vers l'adresse", () => {
    expect(buildMailto()).toEqual({
      href: `mailto:${CONTACT_EMAIL}`,
      address: CONTACT_EMAIL,
      truncated: false,
    });
  });

  it("encode objet et corps (accents, espaces, &, retours à la ligne)", () => {
    const { href, truncated } = buildMailto({
      subject: "Élan & cætera",
      body: "Bonjour,\nune question ?",
    });

    expect(truncated).toBe(false);
    expect(href).toBe(
      `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Élan & cætera")}&body=${encodeURIComponent("Bonjour,\nune question ?")}`,
    );
    // Aucun caractère brut susceptible de casser l'URL n'y survit — seul le
    // `&` de séparation des deux paramètres subsiste, et il est structurel.
    expect(href).not.toMatch(/[ \n]/);
    expect(href).not.toContain("É");
    expect(href.match(/&/g)).toHaveLength(1);
  });

  it("omet le paramètre absent plutôt que de poser un champ vide", () => {
    expect(buildMailto({ subject: "Contact" }).href).toBe(
      `mailto:${CONTACT_EMAIL}?subject=Contact`,
    );
    expect(buildMailto({ body: "Bonjour" }).href).toBe(`mailto:${CONTACT_EMAIL}?body=Bonjour`);
  });

  it("rogne les blancs de bordure (une saisie de formulaire en traîne toujours)", () => {
    expect(buildMailto({ subject: "  Contact  ", body: "  Bonjour  " }).href).toBe(
      `mailto:${CONTACT_EMAIL}?subject=Contact&body=Bonjour`,
    );
  });
});

describe("buildMailto — troncature", () => {
  const longBody = "Bonjour, ceci est un très long message. ".repeat(200);

  it("un corps démesuré est raccourci sous la limite, jamais rendu tel quel", () => {
    const { href, truncated } = buildMailto({ subject: "Message du site", body: longBody });

    expect(truncated).toBe(true);
    expect(href.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH);
    expect(decodeURIComponent(href)).toContain(TRUNCATION_MARK);
  });

  it("le corps raccourci reste du texte utile (le début du message est préservé)", () => {
    const { href } = buildMailto({ body: longBody });
    const body = decodeURIComponent(href.split("body=")[1] ?? "");

    expect(body.startsWith("Bonjour, ceci est un très long message.")).toBe(true);
    // Coupure sur une frontière de MOT : le texte gardé s'arrête à la fin
    // d'une phrase répétée, jamais au milieu d'un mot (« … long mes »).
    expect(body.replace(TRUNCATION_MARK, "").endsWith("message.")).toBe(true);
  });

  it("les accents comptent pour leur longueur ENCODÉE (9 caractères, pas 1)", () => {
    // Un corps d'accents purs : une troncature qui compterait les caractères
    // bruts produirait une URL très au-dessus de la limite.
    const { href, truncated } = buildMailto({ body: "é".repeat(2000) });

    expect(truncated).toBe(true);
    expect(href.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH);
  });

  it("un corps qui tient tout juste n'est pas touché", () => {
    // Longueur choisie pour rester sous la limite une fois encodée (ASCII).
    const body = "a".repeat(MAILTO_MAX_LENGTH - `mailto:${CONTACT_EMAIL}?body=`.length);
    const { href, truncated } = buildMailto({ body });

    expect(truncated).toBe(false);
    expect(href.length).toBe(MAILTO_MAX_LENGTH);
  });

  it("cas dégénéré (objet démesuré) : lien nu plutôt qu'URL hors limite", () => {
    const { href, truncated } = buildMailto({
      subject: "é".repeat(1000),
      body: "Bonjour",
    });

    expect(truncated).toBe(true);
    expect(href.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH);
    expect(href).toContain(CONTACT_EMAIL);
  });
});
