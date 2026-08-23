import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { BottomSheet } from "./bottom-sheet";

const MOBILE_QUERY = "(max-width: 1023.98px)";
let reduceMotion = false;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        if (query === MOBILE_QUERY) return true;
        if (query === "(prefers-reduced-motion: reduce)") return reduceMotion;
        return false;
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
  reduceMotion = false;
  vi.useRealTimers();
  document.body.style.paddingBottom = "";
});

function handle(el: HTMLElement): HTMLButtonElement {
  return el.querySelector("button[aria-expanded]")!;
}

function panel(el: HTMLElement): HTMLElement {
  const id = handle(el).getAttribute("aria-controls")!;
  return document.getElementById(id)!;
}

describe("BottomSheet — Échap (issue #114)", () => {
  it("Échap referme la feuille ouverte et rend le focus à la poignée", () => {
    const el = mount(
      <BottomSheet label="Contribuer" autoOpenDelayMs={60_000}>
        <a href="#x">Lien dans le panneau</a>
      </BottomSheet>,
    );
    expect(handle(el).getAttribute("aria-expanded")).toBe("false");
    expect(panel(el).hasAttribute("inert")).toBe(true);

    act(() => {
      handle(el).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(handle(el).getAttribute("aria-expanded")).toBe("true");
    expect(panel(el).hasAttribute("inert")).toBe(false);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(handle(el).getAttribute("aria-expanded")).toBe("false");
    expect(panel(el).hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(handle(el));
  });

  it("Échap dans un champ de saisie ne referme PAS la feuille", () => {
    const el = mount(
      <BottomSheet label="Contribuer" autoOpenDelayMs={60_000}>
        <input name="amount" />
      </BottomSheet>,
    );
    act(() => {
      handle(el).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    const input = el.querySelector("input")!;
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(panel(el).hasAttribute("inert")).toBe(false);
  });
});

describe("BottomSheet — auto-open reduced-motion (issue #114)", () => {
  it("n'ouvre pas tout seul sous prefers-reduced-motion", () => {
    reduceMotion = true;
    vi.useFakeTimers();
    const el = mount(
      <BottomSheet label="Contribuer" autoOpenDelayMs={0}>
        <p>Paliers</p>
      </BottomSheet>,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(handle(el).getAttribute("aria-expanded")).toBe("false");
  });
});
