import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogueSearchBox } from "./catalogue-search-box";
import type { SuggestionIndexData, SuggestionKind } from "@/lib/search-suggest-core";

/**
 * Verrouille la grammaire combobox de la complétion : liste `role="listbox"`
 * d'options-LIENS, focus DOM qui ne quitte jamais l'input, option active par
 * `aria-activedescendant`, Entrée qui suit le lien actif et Échap qui ferme
 * sans vider. L'index est servi par un `fetch` moqué — la promesse partagée
 * au niveau module fait qu'UN SEUL chargement sert tous les montages du
 * fichier.
 */

const INDEX: SuggestionIndexData = {
  books: [
    {
      title: "Le Capital",
      authors: ["Karl Marx"],
      libelles: ["GEME"],
      edition: "editions-sociales",
      slug: "capital",
    },
    {
      title: "Le Genre du capital",
      authors: ["Céline Bessière"],
      libelles: [],
      edition: "la-dispute",
      slug: "genre",
    },
  ],
  authors: [
    { name: "Karl Marx", slug: "marx", count: 1, editions: ["editions-sociales"] },
    { name: "Céline Bessière", slug: "bessiere", count: 1, editions: ["la-dispute"] },
  ],
  libelles: [{ name: "GEME", slug: "geme", count: 1, editions: ["editions-sociales"] }],
};

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => INDEX }) as unknown as Response);

/** Clics interceptés en amont de React : href de l'ancre suivie, navigation neutralisée. */
const followedLinks: string[] = [];
const interceptClick = (e: MouseEvent) => {
  const anchor = e.target instanceof Element ? e.target.closest("a") : null;
  if (!anchor) return;
  e.preventDefault();
  e.stopPropagation();
  followedLinks.push(anchor.getAttribute("href") ?? "");
};

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
  // jsdom n'implémente pas scrollIntoView, que le composant appelle sur
  // l'option active.
  Element.prototype.scrollIntoView = () => {};
  document.addEventListener("click", interceptClick, true);
});

beforeEach(() => {
  followedLinks.length = 0;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness({
  lockedEdition,
  onCommit = () => {},
  onPick = () => {},
}: {
  lockedEdition?: string;
  onCommit?: () => void;
  onPick?: (kind: SuggestionKind) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <CatalogueSearchBox
      value={value}
      onValueChange={setValue}
      onCommit={onCommit}
      onPick={onPick}
      hrefForAuthor={(slug) => `/catalogue?author=${slug}`}
      hrefForLibelle={(slug) => `/catalogue?libelle=${slug}`}
      lockedEdition={lockedEdition}
    />
  );
}

function mount(props: Parameters<typeof Harness>[0] = {}): HTMLInputElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<Harness {...props} />);
  });
  return container.querySelector("input")!;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

/** Frappe contrôlée : setter natif + événement `input` remonté à React. */
function typeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
    .set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function focusAndLoadIndex(input: HTMLInputElement) {
  await act(async () => {
    input.focus();
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
  // Laisse la promesse d'index se résoudre et l'état se poser.
  await act(async () => {});
}

function pressKey(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

const listbox = () => container!.querySelector('[role="listbox"]');
const options = () => [...container!.querySelectorAll<HTMLAnchorElement>('[role="option"]')];
const activeDescendant = (input: HTMLInputElement) => input.getAttribute("aria-activedescendant");

describe("CatalogueSearchBox — complétion de la recherche catalogue", () => {
  it("charge l'index au focus puis suggère à la frappe, en groupes, sans quitter l'input", async () => {
    const input = mount();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");

    await focusAndLoadIndex(input);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listbox()).toBeNull();

    typeValue(input, "capital");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(listbox()).not.toBeNull();
    const texts = options().map((o) => o.textContent);
    expect(texts.some((t) => t?.includes("Le Capital"))).toBe(true);
    expect(texts.some((t) => t?.includes("Le Genre du capital"))).toBe(true);
    // Groupes nommés, hors liste d'options (role="presentation").
    const headers = [...container!.querySelectorAll('[role="presentation"]')].map(
      (h) => h.textContent,
    );
    expect(headers).toContain("Titres");
    // La frappe appariée est surlignée dans l'option.
    expect(options()[0].querySelector("strong")).not.toBeNull();
    // Le focus DOM n'a jamais quitté l'input.
    expect(document.activeElement).toBe(input);
  });

  it("suggère auteurs et libellés vers leurs hrefs de filtre", async () => {
    const input = mount();
    await focusAndLoadIndex(input);
    typeValue(input, "marx");
    const hrefs = options().map((o) => o.getAttribute("href"));
    expect(hrefs).toContain("/catalogue?author=marx");
    typeValue(input, "geme");
    expect(options().map((o) => o.getAttribute("href"))).toContain("/catalogue?libelle=geme");
  });

  it("flèches : option active par aria-activedescendant, avec bouclage", async () => {
    const input = mount();
    await focusAndLoadIndex(input);
    typeValue(input, "capital");
    expect(activeDescendant(input)).toBeNull();

    pressKey(input, "ArrowDown");
    const first = activeDescendant(input);
    expect(first).toBeTruthy();
    expect(document.getElementById(first!)?.getAttribute("aria-selected")).toBe("true");

    pressKey(input, "ArrowUp");
    const last = activeDescendant(input);
    expect(last).toBe(options().at(-1)!.id);
    expect(document.activeElement).toBe(input);
  });

  it("Entrée suit le lien de l'option active ; sans option active, pousse la recherche", async () => {
    const onCommit = vi.fn();
    const input = mount({ onCommit });
    await focusAndLoadIndex(input);

    typeValue(input, "capital");
    pressKey(input, "Enter");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(followedLinks).toEqual([]);

    typeValue(input, "capital");
    pressKey(input, "ArrowDown");
    const activeHref = document.getElementById(activeDescendant(input)!)?.getAttribute("href");
    pressKey(input, "Enter");
    expect(followedLinks).toEqual([activeHref]);
  });

  it("Échap ferme la liste SANS vider le champ ; la frappe suivante la rouvre", async () => {
    const input = mount();
    await focusAndLoadIndex(input);
    typeValue(input, "capital");
    expect(listbox()).not.toBeNull();

    pressKey(input, "Escape");
    expect(listbox()).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.value).toBe("capital");

    typeValue(input, "capita");
    expect(listbox()).not.toBeNull();
  });

  it("survoler une option la rend active (le clavier et la souris partagent l'état)", async () => {
    const input = mount();
    await focusAndLoadIndex(input);
    typeValue(input, "capital");
    const target = options().at(-1)!;
    act(() => {
      target.dispatchEvent(new Event("pointermove", { bubbles: true }));
    });
    expect(activeDescendant(input)).toBe(target.id);
  });

  it("édition verrouillée : les trois groupes se restreignent au fonds", async () => {
    const input = mount({ lockedEdition: "la-dispute" });
    await focusAndLoadIndex(input);
    typeValue(input, "capital");
    const texts = options().map((o) => o.textContent);
    expect(texts.some((t) => t?.includes("Le Genre du capital"))).toBe(true);
    expect(texts.some((t) => t?.includes("Le Capital —"))).toBe(false);
    typeValue(input, "marx");
    expect(listbox()).toBeNull();
  });

  it("rien ne s'ouvre sans appariement, et le blur referme", async () => {
    const input = mount();
    await focusAndLoadIndex(input);
    typeValue(input, "zzzz");
    expect(listbox()).toBeNull();

    typeValue(input, "capital");
    expect(listbox()).not.toBeNull();
    act(() => {
      input.blur();
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(listbox()).toBeNull();
  });
});
