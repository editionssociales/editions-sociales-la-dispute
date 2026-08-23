import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "./site-header";
import { maisonMonogramName } from "@/lib/nav";

vi.mock("next/link", () => ({
  default: function MockLink({
    children,
    href,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./cart/cart-context", () => ({
  useCart: () => ({
    count: 0,
    ready: true,
    state: { lines: [] },
    addToCart: () => {},
    setLineQty: () => {},
    removeFromCart: () => {},
    clearCart: () => {},
  }),
}));

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

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
});

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

describe("SiteHeader — monogrammes (issue #108)", () => {
  it("le nom accessible des monogrammes LD et ES contient le sigle visible", () => {
    const el = mount(<SiteHeader />);
    const ld = [...el.querySelectorAll('a[href="/editions/la-dispute"]')].find((a) =>
      a.hasAttribute("aria-label"),
    );
    const es = [...el.querySelectorAll('a[href="/editions/editions-sociales"]')].find((a) =>
      a.hasAttribute("aria-label"),
    );
    expect(ld?.getAttribute("aria-label")).toBe(maisonMonogramName("LD", "La Dispute"));
    expect(es?.getAttribute("aria-label")).toBe(
      maisonMonogramName("ES", "Les Éditions sociales"),
    );
    expect(ld?.getAttribute("aria-label")).toMatch(/LD/);
    expect(es?.getAttribute("aria-label")).toMatch(/ES/);
  });
});

describe("SiteHeader — Échap referme le menu mobile (issue #114)", () => {
  it("Échap pose `inert` sur le panneau et rend le focus à la bascule", () => {
    const el = mount(<SiteHeader />);
    const open = [...el.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Ouvrir le menu",
    );
    expect(open).toBeTruthy();
    const panelId = open!.getAttribute("aria-controls")!;
    const panel = document.getElementById(panelId)!;
    expect(panel.hasAttribute("inert")).toBe(true);

    act(() => {
      open!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(panel.hasAttribute("inert")).toBe(false);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(panel.hasAttribute("inert")).toBe(true);
  });
});
