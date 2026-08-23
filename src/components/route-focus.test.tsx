import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { shouldMoveRouteFocus } from "./route-focus";

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

describe("shouldMoveRouteFocus — garde catalogue (issue #115)", () => {
  it("autorise le déplacement quand le focus est sur body ou absent", () => {
    expect(shouldMoveRouteFocus(null, document.body)).toBe(true);
    expect(shouldMoveRouteFocus(document.body, document.body)).toBe(true);
  });

  it("refuse de voler le curseur d'un champ de recherche", () => {
    const el = mount(
      <input type="search" aria-label="Rechercher" defaultValue="marx" />,
    );
    const input = el.querySelector("input")!;
    act(() => {
      input.focus();
    });
    expect(shouldMoveRouteFocus(document.activeElement, document.body)).toBe(false);
  });

  it("autorise le déplacement depuis un lien (clic couverture)", () => {
    const el = mount(<a href="/catalogue/editions-sociales/un-livre">Fiche</a>);
    const link = el.querySelector("a")!;
    act(() => {
      link.focus();
    });
    expect(shouldMoveRouteFocus(document.activeElement, document.body)).toBe(true);
  });
});
