import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MosaicDisclosure } from "./mosaic-disclosure";

/**
 * `MosaicDisclosure` est l'implémentation de référence de la « grammaire des
 * déroulés » (`src/components/CLAUDE.md`, § « Grammaire des déroulés ») :
 * `<button aria-expanded aria-controls>`, panneau qui reste MONTÉ replié,
 * sortie du parcours clavier par `inert` — JAMAIS par `visibility` —, id par
 * `useId`. Ce fichier verrouille ces quatre points sur le repos ET la
 * bascule, pour toute autre implémentation du même patron (header mobile,
 * feuille de bas d'écran) qui s'en réclamerait — SOUS `lg` uniquement depuis
 * le retour client du 29/08 : à `lg`+, les étages sont TOUJOURS visibles,
 * jamais `inert`, cf. le second `describe`.
 */

const MOBILE_QUERY = "(max-width: 1023.98px)";
/** Piloté par chaque bloc de test — `true` par défaut (le régime « sous lg »,
 *  celui où la bascule fait réellement quelque chose). */
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
});

beforeEach(() => {
  mobile = true;
});

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

describe("MosaicDisclosure — replié par défaut (sous lg)", () => {
  it("bouton aria-expanded=false/aria-controls, libellé texte visible « Trier par thème », panneau MONTÉ et sorti du clavier par `inert` (jamais `visibility`)", () => {
    const el = mount(
      <MosaicDisclosure banner={<div>Tous les livres</div>} bannerStyle={{}} bannerActive={true}>
        <div>Essais</div>
      </MosaicDisclosure>,
    );

    const button = el.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.getAttribute("aria-expanded")).toBe("false");
    // Déclencheur spécifique au contenu : libellé texte visible, pas une
    // icône seule (cf. `src/components/CLAUDE.md`).
    expect(button!.textContent).toContain("Trier par thème");

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
    // Comparaison sur les CLASSES ENTIÈRES, pas par regex : `\bhidden\b`
    // matcherait à l'intérieur d'`overflow-hidden`, que le contrat EXIGE
    // pourtant sur l'item du déroulé (cf. « Grammaire des déroulés »).
    const classes = panel!.className.split(/\s+/).filter(Boolean);
    expect(classes).not.toContain("invisible");
    expect(classes).not.toContain("hidden");
    expect(classes).toContain("overflow-hidden");
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

describe("MosaicDisclosure — bascule au clic (sous lg)", () => {
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

describe("MosaicDisclosure — à lg+, toujours visible", () => {
  it("aucun `inert` sur le panneau même à l'état replié, quel que soit `bannerActive`", () => {
    mobile = false;
    const el = mount(
      <MosaicDisclosure banner={<div>Tous les livres</div>} bannerStyle={{}} bannerActive={true}>
        <div>Essais</div>
      </MosaicDisclosure>,
    );

    const button = el.querySelector("button")!;
    const panelId = button.getAttribute("aria-controls")!;
    const panel = document.getElementById(panelId)!;

    // L'état interne (`open`) reste replié par défaut sur cette page neutre —
    // mais à lg+, ce n'est plus lui qui décide de l'inertie du panneau.
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(false);
  });

  it("le bouton porte `lg:hidden` : la bascule s'efface à lg+, il n'y a plus rien à replier", () => {
    mobile = false;
    const el = mount(
      <MosaicDisclosure banner={<div>Tous les livres</div>} bannerStyle={{}} bannerActive={true}>
        <div>Essais</div>
      </MosaicDisclosure>,
    );

    const button = el.querySelector("button")!;
    const classes = button.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("lg:hidden");
  });
});
