import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ContactPage from "./page";

/**
 * `site-content.ts` importe `@payload-config` (irrésoluble sous vitest — même
 * raison qui cantonne les tests pg aux seams) : on substitue le getter par la
 * fusion pure RÉELLE à global vide (`mergePageContact(null)`,
 * `site-content-core`), pas par des chaînes recopiées — le test traverse ainsi
 * le vrai contrat « champ vide = texte actuel du site ».
 */
vi.mock("@/lib/site-content", async () => {
  const { mergePageContact } =
    await vi.importActual<typeof import("@/lib/site-content-core")>("@/lib/site-content-core");
  return { getPageContact: async () => mergePageContact(null) };
});

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

/* La page est un server component ASYNC depuis qu'elle lit `page-contact` :
   on l'invoque comme la fonction qu'elle est, puis on sérialise le JSX rendu
   (`renderToStaticMarkup` ne sait pas attendre un composant async). */
async function render() {
  return renderToStaticMarkup(await ContactPage());
}

describe("/contact — Brevo absent", () => {
  it("ne rend AUCUN formulaire (il n'aboutirait nulle part)", async () => {
    const html = await render();

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
  });

  it("rend le chemin manuel : adresse en clair ET lien mailto à objet pré-rempli", async () => {
    const html = await render();

    expect(html).toContain("ecrire@editionssociales.fr");
    expect(html).toContain("mailto:ecrire@editionssociales.fr");
    expect(html).toContain(`subject=${encodeURIComponent("Message du site")}`);
  });

  it("ne parle plus de Brevo : rien n'est transmis à un sous-traitant sur ce chemin", async () => {
    expect(await render()).not.toContain("Brevo");
  });
});

describe("/contact — Brevo posée", () => {
  it("rend le formulaire, et la mention de sous-traitance redevient vraie", async () => {
    process.env.BREVO_API_KEY = "xkeysib-cle-de-test";
    const html = await render();

    expect(html).toContain("<form");
    expect(html).toContain("<textarea");
    expect(html).toContain("Brevo");
  });

  it("le repli manuel se retire tout seul — plus d'adresse en dur dans la page", async () => {
    process.env.BREVO_API_KEY = "xkeysib-cle-de-test";

    expect(await render()).not.toContain("mailto:ecrire@editionssociales.fr");
  });

  it("une clé vide ou blanche ne compte PAS comme configurée (même prédicat que brevo.ts)", async () => {
    process.env.BREVO_API_KEY = "   ";

    expect(await render()).toContain("mailto:ecrire@editionssociales.fr");
  });
});
