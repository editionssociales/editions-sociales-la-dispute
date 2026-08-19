import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CountUp } from "@/components/count-up";

/**
 * Compteur de collecte de /souscription — arbitrage client 2026-08-19 :
 * « Enlève ce placeholder (“Campagne tout juste lancée — soyez les
 * premier·ères à contribuer.”), affiche seulement le montant (même à 0 €). »
 *
 * Deux garanties, l'une sur le rendu, l'autre sur la structure de la page :
 *
 *  1. `CountUp` sait rendre 0 € (le montant monumental n'a jamais besoin d'un
 *     repli textuel pour exister) ;
 *  2. la page ne branche plus sur `collected > 0` et ne contient plus la
 *     phrase supprimée — mais garde INTACTES les deux branches d'honnêteté
 *     (panne Stripe `outage`, dons pas encore ouverts `!enabled`) : ce sont
 *     des garde-fous, pas des placeholders, et les confondre est exactement
 *     l'erreur que ce test empêche.
 */

const PAGE = readFileSync(
  path.join(process.cwd(), "src/app/(site)/souscription/page.tsx"),
  "utf8",
);

describe("Compteur de collecte — le montant est TOUJOURS rendu", () => {
  it("`CountUp` rend un 0 € réel, jamais un vide", () => {
    const html = renderToStaticMarkup(<CountUp value={0} suffix=" €" />);
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.querySelector(".sr-only")?.textContent).toBe("0 €");
    expect(container.textContent).toContain("0 €");
  });

  it("la page n'a plus de branche `collected > 0` ni le placeholder de lancement", () => {
    expect(PAGE).not.toContain("Campagne tout juste lancée");
    expect(PAGE).not.toMatch(/liveCampaign\.collected\s*>\s*0/);
    // Le compteur, lui, est bien rendu depuis le montant collecté.
    expect(PAGE).toMatch(/value=\{liveCampaign\.collected\}/);
  });

  it("la sous-ligne des contributeur·rices n'est rendue qu'à partir de 1", () => {
    expect(PAGE).toMatch(/liveCampaign\.contributors\s*>\s*0\s*&&/);
  });

  it("les deux garde-fous d'honnêteté sont intacts", () => {
    // Panne Stripe : jamais un faux 0.
    expect(PAGE).toMatch(/const outage = enabled && campaign2026 === null/);
    expect(PAGE).toContain("le total s’affichera de nouveau");
    // Avant l'ouverture des dons : la date, pas un appel à contribuer.
    expect(PAGE).toContain("La souscription ouvre le 20 août");
  });
});
