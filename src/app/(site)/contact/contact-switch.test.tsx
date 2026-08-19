import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import ContactPage from "./page";

/**
 * Aiguillage de /contact entre les deux états de provisioning — SIMULÉS
 * (variable posée / absente), jamais raisonnés : c'est le seul moyen de
 * vérifier que poser `BREVO_API_KEY` suffit à retrouver le formulaire, sans
 * toucher au code.
 *
 * Contrat central (R7, « jamais un CTA muet ») : dans AUCUN des deux états la
 * page ne doit proposer un chemin qui n'aboutit nulle part — soit un
 * formulaire dont l'envoi peut aboutir, soit une adresse et un `mailto:`.
 */

afterEach(() => {
  delete process.env.BREVO_API_KEY;
});

function render() {
  return renderToStaticMarkup(<ContactPage />);
}

describe("/contact — Brevo absent", () => {
  it("ne rend AUCUN formulaire (il n'aboutirait nulle part)", () => {
    const html = render();

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
  });

  it("rend le chemin manuel : adresse en clair ET lien mailto à objet pré-rempli", () => {
    const html = render();

    expect(html).toContain("ecrire@editionssociales.fr");
    expect(html).toContain("mailto:ecrire@editionssociales.fr");
    expect(html).toContain(`subject=${encodeURIComponent("Message du site")}`);
  });

  it("ne parle plus de Brevo : rien n'est transmis à un sous-traitant sur ce chemin", () => {
    expect(render()).not.toContain("Brevo");
  });
});

describe("/contact — Brevo posée", () => {
  it("rend le formulaire, et la mention de sous-traitance redevient vraie", () => {
    process.env.BREVO_API_KEY = "xkeysib-cle-de-test";
    const html = render();

    expect(html).toContain("<form");
    expect(html).toContain("<textarea");
    expect(html).toContain("Brevo");
  });

  it("le repli manuel se retire tout seul — plus d'adresse en dur dans la page", () => {
    process.env.BREVO_API_KEY = "xkeysib-cle-de-test";

    expect(render()).not.toContain("mailto:ecrire@editionssociales.fr");
  });

  it("une clé vide ou blanche ne compte PAS comme configurée (même prédicat que brevo.ts)", () => {
    process.env.BREVO_API_KEY = "   ";

    expect(render()).toContain("mailto:ecrire@editionssociales.fr");
  });
});
