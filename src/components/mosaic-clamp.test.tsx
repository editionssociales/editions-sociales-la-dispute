import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MosaicClamp, MosaicClampProvider, MosaicClampToggle } from "./mosaic-clamp";

/**
 * Verrouille la grammaire des déroulés sur le repli mobile de
 * l'index-manifeste : `aria-expanded` porté par le bouton, écrêtage actif au
 * repos, et surtout la sortie du parcours clavier/AT par `inert` MESURÉ lien
 * par lien (`offsetTop` ≥ seuil) — jamais `visibility`. jsdom ne fait aucune
 * mise en page : `offsetTop` y est moqué via `data-top`, ce qui permet de
 * simuler un lien au-dessus (visible) et un lien sous le pli (écrêté).
 */

const MOBILE_QUERY = "(max-width: 639.98px)";
/** Piloté par chaque bloc de test — `true` par défaut (le régime « sous sm »,
 *  celui où le repli fait réellement quelque chose). */
let mobile = true;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        return query === MOBILE_QUERY ? mobile : false;
      },
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
  // jsdom rend toujours 0 : le composant lit `offsetTop`, le test le pilote
  // par `data-top` posé sur chaque lien du fixture.
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.dataset.top ?? 0);
    },
  });
});

beforeEach(() => {
  mobile = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      // Même montage que les pages catalogue : panneau et flèche sont deux
      // pièces distinctes reliées par le provider.
      <MosaicClampProvider>
        <MosaicClamp>
          <p>
            <a href="#a" data-top="0">
              Visible
            </a>{" "}
            <a href="#b" data-top="100">
              Écrêté
            </a>
          </p>
        </MosaicClamp>
        <MosaicClampToggle />
      </MosaicClampProvider>,
    );
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const button = () => container!.querySelector("button")!;
const link = (name: string) =>
  [...container!.querySelectorAll("a")].find((a) => a.textContent?.includes(name))!;

describe("MosaicClamp — repli mobile deux lignes", () => {
  it("replié : le lien sous le pli est inert, celui du dessus reste servi", () => {
    mount();
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(link("Écrêté").hasAttribute("inert")).toBe(true);
    expect(link("Visible").hasAttribute("inert")).toBe(false);
  });

  it("déplié : plus aucun inert, l'écrêtage tombe ; replié : tout revient", () => {
    mount();
    act(() => button().click());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(link("Écrêté").hasAttribute("inert")).toBe(false);
    expect(container!.querySelector('[class*="line-clamp-2"]')).toBeNull();

    act(() => button().click());
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(link("Écrêté").hasAttribute("inert")).toBe(true);
    expect(container!.querySelector('[class*="line-clamp-2"]')).not.toBeNull();
  });

  it("à sm+ : aucun inert même replié (le repli est un régime mobile)", () => {
    mobile = false;
    mount();
    expect(link("Écrêté").hasAttribute("inert")).toBe(false);
  });

  it("le bouton contrôle le panneau (aria-controls) et nomme son action", () => {
    mount();
    const panelId = button().getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();
    expect(button().getAttribute("aria-label")).toMatch(/thèmes/);
  });
});
