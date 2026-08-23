import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

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
    expect(html).toContain("opacity-100");
    expect(html).toContain("translate-y-0");
    expect(html).not.toMatch(/\bopacity-0\b/);
    expect(html).not.toMatch(/\btranslate-y-6\b/);
    expect(html).not.toContain("inert");
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

let reduceMotion = false;
let container: HTMLDivElement | null = null;
let root: Root | null = null;
const originalGetRect = HTMLElement.prototype.getBoundingClientRect;

beforeAll(() => {
  class SilentObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    value: SilentObserver,
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        return query === "(prefers-reduced-motion: reduce)" ? reduceMotion : false;
      },
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
});

function offscreenRect() {
  return {
    top: 2000,
    bottom: 2200,
    left: 0,
    right: 100,
    width: 100,
    height: 200,
    x: 0,
    y: 2000,
    toJSON() {},
  };
}

function mountReveal(children: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<Reveal>{children}</Reveal>);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  container?.remove();
  container = null;
  root = null;
  reduceMotion = false;
  HTMLElement.prototype.getBoundingClientRect = originalGetRect;
});

describe("Reveal — inert hors viewport (issue #117)", () => {
  it("un lien opacity-0 n'est plus tabulable (`inert` sur l'enveloppe)", () => {
    Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
    HTMLElement.prototype.getBoundingClientRect = () => offscreenRect() as DOMRect;
    const el = mountReveal(<a href="#cta">Contribuer</a>);
    const wrap = el.querySelector("a")!.closest("[inert]");
    expect(wrap).not.toBeNull();
    expect(wrap!.className).toMatch(/\bopacity-0\b/);
  });

  it("reduced-motion : jamais d'état masqué post-hydratation", () => {
    reduceMotion = true;
    Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
    HTMLElement.prototype.getBoundingClientRect = () => offscreenRect() as DOMRect;
    const el = mountReveal(<a href="#cta">Contribuer</a>);
    expect(el.querySelector("[inert]")).toBeNull();
    expect(el.innerHTML).not.toMatch(/\bopacity-0\b/);
  });
});
