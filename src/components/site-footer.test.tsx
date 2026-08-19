import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "./site-footer";

/**
 * Deux contrats du pied de page, l'un permanent, l'autre aiguillé :
 *
 * 1. l'adresse publique y est TOUJOURS visible — le site n'en affichait
 *    aucune, un visiteur n'avait alors strictement aucun moyen de joindre la
 *    maison ; elle ne dépend pas du provisioning e-mail ;
 * 2. la cellule newsletter suit l'état réel — sans Brevo, le double opt-in
 *    n'existe pas (c'est la liste Brevo qui EST le dispositif), on n'affiche
 *    donc pas un champ qui échouerait en silence, et la mention de
 *    sous-traitance disparaît avec lui.
 */

const FOOTER = {
  adresse: "Paris, France.",
  reseauxSociaux: [],
};

describe("SiteFooter — adresse publique (permanente)", () => {
  it("affiche l'adresse en clair et cliquable, quel que soit l'état de Brevo", () => {
    for (const newsletterEnabled of [true, false]) {
      const html = renderToStaticMarkup(
        <SiteFooter footer={FOOTER} newsletterEnabled={newsletterEnabled} />,
      );

      expect(html).toContain("ecrire@editionssociales.fr");
      expect(html).toContain("mailto:ecrire@editionssociales.fr");
    }
  });
});

describe("SiteFooter — newsletter sans Brevo", () => {
  const html = renderToStaticMarkup(<SiteFooter footer={FOOTER} newsletterEnabled={false} />);

  it("ne rend pas un champ d'inscription qui échouerait en silence", () => {
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="email"');
  });

  it("propose d'écrire, objet pré-rempli", () => {
    // L'apostrophe du sujet n'a pas à être percent-encodée (elle est licite
    // dans une query) : React l'échappe en `&#x27;` dans l'attribut HTML.
    const expected =
      `mailto:ecrire@editionssociales.fr?subject=${encodeURIComponent("Inscription à la lettre d'information")}`.replace(
        /'/g,
        "&#x27;",
      );

    expect(html).toContain(expected);
  });

  it("ne mentionne plus Brevo : rien ne lui est transmis sur ce chemin", () => {
    expect(html).not.toContain("Brevo");
  });
});

describe("SiteFooter — newsletter avec Brevo", () => {
  const html = renderToStaticMarkup(<SiteFooter footer={FOOTER} newsletterEnabled />);

  it("rend le formulaire de double opt-in", () => {
    expect(html).toContain("<form");
    expect(html).toContain('type="email"');
  });

  it("la mention de sous-traitance redevient vraie, et est affichée", () => {
    expect(html).toContain("Brevo");
  });
});
