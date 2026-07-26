import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { MosaicDisclosure } from "./mosaic-disclosure";

/**
 * `MosaicDisclosure` est l'implémentation de référence de la « grammaire des
 * déroulés » (`src/components/CLAUDE.md`, § « Grammaire des déroulés ») :
 * `<button aria-expanded aria-controls>`, panneau qui reste MONTÉ replié,
 * sortie du parcours clavier par `inert` — JAMAIS par `visibility` —, id par
 * `useId`. Ce fichier verrouille ces quatre points sur le repos ET la
 * bascule, pour toute autre implémentation du même patron (header mobile,
 * feuille de bas d'écran) qui s'en réclamerait.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(children: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(children);
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
});

describe("MosaicDisclosure — replié par défaut", () => {
  it("bouton aria-expanded=false/aria-controls, panneau MONTÉ et sorti du clavier par `inert` (jamais `visibility`)", () => {
    const el = mount(
      <MosaicDisclosure banner={<div>Tous les livres</div>} bannerStyle={{}} bannerActive={true}>
        <div>Essais</div>
      </MosaicDisclosure>,
    );

    const button = el.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.getAttribute("aria-expanded")).toBe("false");

    const panelId = button!.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();

    const panel = document.getElementById(panelId!);
    expect(panel).not.toBeNull();
    // Replié, le panneau reste dans le DOM — jamais démonté.
    expect(panel!.textContent).toContain("Essais");

    // Sorti du parcours clavier par `inert` ...
    expect(panel!.hasAttribute("inert")).toBe(true);
    // ... jamais par `visibility` (ni style inline, ni classe utilitaire
    // `invisible`/`hidden` qui la poserait).
    expect(panel!.style.visibility).toBe("");
    expect(panel!.className).not.toMatch(/\b(invisible|hidden)\b/);
  });

  it("l'id du panneau vient de `useId` : unique entre deux instances rendues dans le même arbre, pas littéral", () => {
    const el = mount(
      <>
        <MosaicDisclosure banner={<div>A</div>} bannerStyle={{}} bannerActive={true}>
          <div>Enfant A</div>
        </MosaicDisclosure>
        <MosaicDisclosure banner={<div>B</div>} bannerStyle={{}} bannerActive={true}>
          <div>Enfant B</div>
        </MosaicDisclosure>
      </>,
    );

    const buttons = el.querySelectorAll("button");
    expect(buttons).toHaveLength(2);

    const ids = Array.from(buttons).map((b) => b.getAttribute("aria-controls"));
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    // Un id littéral collisionnerait ici — c'est précisément ce qu'un id par
    // `useId` évite (cf. commentaire du composant : une copie du header en
    // flux dans le document dupliquerait un id littéral).
    expect(ids[0]).not.toBe(ids[1]);

    // Chaque bouton contrôle bien SON panneau, pas celui du voisin.
    expect(document.getElementById(ids[0]!)!.textContent).toContain("Enfant A");
    expect(document.getElementById(ids[1]!)!.textContent).toContain("Enfant B");
  });
});

describe("MosaicDisclosure — bascule au clic", () => {
  it("clic : `aria-expanded` passe à true et `inert` disparaît du panneau", () => {
    const el = mount(
      <MosaicDisclosure banner={<div>Tous les livres</div>} bannerStyle={{}} bannerActive={true}>
        <div>Essais</div>
      </MosaicDisclosure>,
    );

    const button = el.querySelector("button")!;
    const panelId = button.getAttribute("aria-controls")!;
    const panel = document.getElementById(panelId)!;

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(true);

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(false);

    // Un second clic referme — la bascule est réversible, pas un aller simple.
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(true);
  });
});
