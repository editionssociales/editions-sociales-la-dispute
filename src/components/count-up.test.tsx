import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatInt } from "@/lib/format";
import { CountUp } from "./count-up";

/**
 * Fail-open des Métriques (`src/components/CLAUDE.md`, § « Fail-open des
 * Métriques ») : « Ne jamais réintroduire un état initial `opacity-0`/`0`
 * rendu côté serveur. » `CountUp` initialise `display` directement à
 * `value` (`useState(value)`) — la boucle `rAF` qui l'anime depuis 0 ne
 * démarre que dans un `useEffect`, jamais lors d'un rendu serveur statique.
 * Ce test échoue si quelqu'un réintroduit un `useState(0)` (ou équivalent)
 * comme état initial : le HTML serveur (bots/no-JS) doit porter la VRAIE
 * valeur partout où elle apparaît — sizer anti-CLS, overlay animé, `sr-only`.
 */
describe("CountUp — fail-open sans JS", () => {
  it("rendu serveur : la vraie valeur partout, jamais un `0` de compteur qui n'aurait pas encore démarré", () => {
    const html = renderToStaticMarkup(<CountUp value={1234} suffix=" €" />);
    const container = document.createElement("div");
    container.innerHTML = html;

    const expected = `${formatInt(1234)} €`;

    // Sizer anti-CLS (`invisible`, mais toujours la vraie valeur — il fige la
    // largeur finale, ce n'est pas l'état masqué du fail-open).
    const sizer = container.querySelector<HTMLSpanElement>(".invisible");
    expect(sizer).not.toBeNull();
    expect(sizer!.textContent).toBe(expected);

    // Overlay animé — c'est CE nœud que l'effet ferait partir de 0 en JS ;
    // au premier rendu serveur il doit déjà porter la valeur réelle.
    const animated = container.querySelector<HTMLSpanElement>(".absolute.inset-0");
    expect(animated).not.toBeNull();
    expect(animated!.textContent).toBe(expected);
    expect(animated!.textContent).not.toBe(formatInt(0));

    // Valeur stable pour les technologies d'assistance.
    const srOnly = container.querySelector<HTMLSpanElement>(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.textContent).toBe(expected);
  });

  it("valeur nulle légitime (0) : reste un `0` explicite, pas un artefact de masquage", () => {
    const html = renderToStaticMarkup(<CountUp value={0} />);
    const container = document.createElement("div");
    container.innerHTML = html;

    const animated = container.querySelector<HTMLSpanElement>(".absolute.inset-0");
    expect(animated!.textContent).toBe(formatInt(0));
  });
});
