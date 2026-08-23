import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/components/cart/cart-context";
import { CART_VERSION } from "@/lib/cart-core";
import type { Book } from "@/lib/types";
import type { CartSnapshot } from "./snapshot";

/**
 * L'ajout d'un goodie (tote-bag) depuis `/panier` disparaissait au clic :
 * l'auto-guérison (`missingIds`) comparait le panier FRAIS à l'instantané
 * STALE — l'id tout juste ajouté n'y était pas encore, donc `removeFromCart`
 * le retirait avant que `getCartSnapshot` n'ait relu le catalogue.
 */

const CAPITAL: Book = {
  id: 1,
  edition: "editions-sociales",
  origin: "catalogue",
  slug: "capital",
  title: "Le Capital",
  authors: [],
  libelles: [],
  isbn: null,
  price: 20,
  pages: null,
  publishedAt: null,
  cover: null,
  buy: { boutique: null, parislibrairies: null, lalibrairie: null },
  status: "available",
  permalink: "/catalogue/editions-sociales/capital",
  purchaseMode: "cart",
};

const TOTEBAG: Book = {
  id: 42,
  edition: null,
  origin: "boutique",
  slug: "totebag",
  title: "Tote bag",
  authors: [],
  libelles: [],
  isbn: null,
  price: 15,
  pages: null,
  publishedAt: null,
  cover: null,
  buy: { boutique: null, parislibrairies: null, lalibrairie: null },
  status: "available",
  permalink: "/boutique/totebag",
  purchaseMode: "cart",
};

const CATALOGUE: Record<number, Book> = { 1: CAPITAL, 42: TOTEBAG };

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
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/image", () => ({
  default: function MockImage({ alt }: { alt: string }) {
    return <img alt={alt} />;
  },
}));

vi.mock("./actions", () => ({
  getCartSnapshot: async (ids: number[]): Promise<CartSnapshot> => ({
    books: ids.flatMap((id) => (CATALOGUE[id] ? [CATALOGUE[id]] : [])),
    reducedShippingFlags: ids.map((id) => ({ id, flag: false })),
  }),
  validatePromoCode: async () => ({
    ok: false as const,
    reason: "not-found" as const,
    message: "Code promo introuvable.",
  }),
}));

const { CartView } = await import("./cart-view");

const STORAGE_KEY = "es-ld-panier";

const memoryStorage = new Map<string, string>();
const localStorageStub: Storage = {
  get length() {
    return memoryStorage.size;
  },
  clear() {
    memoryStorage.clear();
  },
  getItem(key) {
    return memoryStorage.get(key) ?? null;
  },
  key(index) {
    return [...memoryStorage.keys()][index] ?? null;
  },
  removeItem(key) {
    memoryStorage.delete(key);
  },
  setItem(key, value) {
    memoryStorage.set(key, String(value));
  },
};

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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settle(el: HTMLElement): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await flush();
    if (!el.textContent?.includes("Chargement du panier") && !el.getAttribute("aria-busy")) {
      if (el.querySelector("[aria-busy='true']")) continue;
      if (el.textContent?.includes("Vérification du panier")) continue;
      return;
    }
  }
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
  memoryStorage.clear();
});

beforeAll(() => {
  // Vitest 4 + jsdom ici : `localStorage` n'est pas un Storage réel
  // (`--localstorage-file` sans chemin). Le panier persiste dessus.
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageStub,
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

const toteGoodie = {
  id: TOTEBAG.id,
  slug: TOTEBAG.slug,
  title: TOTEBAG.title,
  price: TOTEBAG.price,
  cover: TOTEBAG.cover,
};

function seedCart(ids: number[]): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: CART_VERSION,
      lines: ids.map((id) => ({ id, qty: 1 })),
    }),
  );
}

describe("CartView — ajout goodie au checkout", () => {
  it("un tote-bag ajouté depuis la suggestion reste dans le panier (pas d'auto-guérison sur instantané périmé)", async () => {
    seedCart([CAPITAL.id]);
    const el = mount(
      <CartProvider>
        <CartView goodies={[toteGoodie]} />
      </CartProvider>,
    );
    await settle(el);
    expect(el.textContent).toContain("Le Capital");
    expect(el.textContent).toContain("Tote bag");

    const add = el.querySelector<HTMLButtonElement>(
      'button[aria-label^="Ajouter Tote bag au panier"]',
    );
    expect(add).not.toBeNull();
    act(() => {
      add!.click();
    });
    await settle(el);

    expect(el.textContent).toContain("Tote bag");
    expect(el.querySelector('button[aria-label^="Ajouter Tote bag au panier"]')).toBeNull();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      lines: { id: number }[];
    };
    expect(stored.lines.map((l) => l.id)).toEqual([CAPITAL.id, TOTEBAG.id]);
  });

  it("même depuis un panier vide (seule surface de découverte des goodies)", async () => {
    const el = mount(
      <CartProvider>
        <CartView goodies={[toteGoodie]} />
      </CartProvider>,
    );
    await settle(el);
    expect(el.textContent).toContain("Votre panier est vide");

    const add = el.querySelector<HTMLButtonElement>(
      'button[aria-label^="Ajouter Tote bag au panier"]',
    );
    expect(add).not.toBeNull();
    act(() => {
      add!.click();
    });
    await settle(el);

    expect(el.textContent).not.toContain("Votre panier est vide");
    expect(el.textContent).toContain("Tote bag");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      lines: { id: number }[];
    };
    expect(stored.lines.map((l) => l.id)).toEqual([TOTEBAG.id]);
  });

  it("retire toujours un id introuvable une fois l'instantané de CETTE composition relu", async () => {
    seedCart([CAPITAL.id, 999]);
    const el = mount(
      <CartProvider>
        <CartView goodies={[]} />
      </CartProvider>,
    );
    await settle(el);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      lines: { id: number }[];
    };
    expect(stored.lines.map((l) => l.id)).toEqual([CAPITAL.id]);
    expect(el.textContent).toContain("Le Capital");
    expect(el.textContent).not.toContain("999");
  });
});
