import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Reveal } from "./reveal";

/**
 * Fail-open des Métriques (`src/components/CLAUDE.md`, § « Fail-open des
 * Métriques ») : « Ne jamais réintroduire un état initial `opacity-0`/`0`
 * rendu côté serveur. » `Reveal` n'arme son masquage que dans un
 * `useLayoutEffect` — donc jamais lors d'un rendu serveur statique (bots,
 * no-JS, lecteurs qui n'exécutent aucun effet). Le HTML produit par
 * `renderToStaticMarkup` (aucun effet n'y tourne) doit donc TOUJOURS afficher
 * le contenu, jamais l'état masqué. C'est le contrat que la jauge a déjà
 * enfreint une fois — ce test échoue si `Reveal` réintroduit un état initial
 * `opacity-0`/`translate-y-6` côté serveur.
 */
describe("Reveal — fail-open sans JS", () => {
  it("rendu serveur : contenu visible, jamais opacity-0/translate-y initial", () => {
    const html = renderToStaticMarkup(
      <Reveal>
        <p>Contenu critique (bots, no-JS)</p>
      </Reveal>,
    );

    expect(html).toContain("Contenu critique");
    // L'état visible ...
    expect(html).toContain("opacity-100");
    expect(html).toContain("translate-y-0");
    // ... jamais l'état masqué qu'armerait (à tort) un rendu serveur.
    expect(html).not.toMatch(/\bopacity-0\b/);
    expect(html).not.toMatch(/\btranslate-y-6\b/);
  });

  it("rendu serveur : même garantie avec un `delay`, qui ne doit pas réintroduire de masquage", () => {
    const html = renderToStaticMarkup(
      <Reveal delay={300}>
        <p>Second bloc</p>
      </Reveal>,
    );

    expect(html).toContain("Second bloc");
    expect(html).toContain("opacity-100");
    expect(html).not.toMatch(/\bopacity-0\b/);
  });
});
