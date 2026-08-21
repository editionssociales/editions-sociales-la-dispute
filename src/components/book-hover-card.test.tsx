import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BookHoverCard, type BookHoverCardData } from "./book-hover-card";

/**
 * `BookHoverCard` implémente le pattern tooltip riche (WCAG 1.4.13) —
 * ce fichier verrouille les points sur lesquels une mauvaise implémentation
 * se casserait : ouverture immédiate au focus (`aria-describedby`), fermeture
 * au blur/Échap, délais de survol PARTAGÉS déclencheur↔carte, inertie totale
 * sur un appareil sans survol, rendu en PORTAIL (`document.body`, jamais un
 * descendant du conteneur), et l'absence de tout élément interactif dans la
 * carte (règle nested-interactive, cf. `book-card.tsx`).
 *
 * `mouseover`/`mouseout` plutôt que `mouseenter`/`mouseleave` : React
 * synthétise `onMouseEnter`/`onMouseLeave` depuis les natifs `mouseover`/
 * `mouseout` (`registerDirectEvent("onMouseEnter", ["mouseout", "mouseover"])`,
 * React n'écoute jamais nativement `mouseenter`/`mouseleave`, qui ne bullent
 * pas et ne peuvent pas être délégués à la racine) — un `relatedTarget: null`
 * (départ/arrivée hors de tout élément) suffit à faire lire l'événement comme
 * une entrée/sortie complète par React.
 */

let hoverNoneQuery = false;

beforeAll(() => {
  // Bouchon minimal de `matchMedia`, `matches` en LECTURE dynamique (pas une
  // valeur figée à la création) : le même objet `MediaQueryList` bouché est
  // mis en cache par `useMediaQuery` (une Map par chaîne de requête, module
  // partagé) — sans getter, un second test avec un autre `hoverNoneQuery`
  // relirait la valeur figée du premier au lieu de la sienne.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        return query === "(hover: none)" ? hoverNoneQuery : false;
      },
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
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

function fireEnter(el: Element) {
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, relatedTarget: null }));
}

function fireLeave(el: Element) {
  el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, cancelable: true, relatedTarget: null }));
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
  hoverNoneQuery = false;
  vi.useRealTimers();
});

const DATA: BookHoverCardData = {
  title: "Le Capital",
  authors: "Karl Marx",
  editionLabel: "Les Éditions sociales",
  libelles: ["GEME"],
  priceLabel: "20,00 €",
  excerpt: "Une critique de l'économie politique.",
  coverUrl: null,
};

/** Récupère le `<span>` racine posé par `BookHoverCard` — premier enfant du conteneur de montage, `tabIndex` ou pas (inerte). */
function rootTrigger(el: HTMLDivElement): HTMLElement {
  return el.firstElementChild as HTMLElement;
}

function tooltip(): HTMLElement | null {
  return document.body.querySelector('[role="tooltip"]');
}

describe("BookHoverCard — focus clavier", () => {
  it("ouvre immédiatement au focus (`aria-describedby` posé sur le déclencheur), ferme au blur", () => {
    const el = mount(
      <BookHoverCard data={DATA}>
        <span>Le Capital</span>
      </BookHoverCard>,
    );
    const trigger = rootTrigger(el);
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
    expect(tooltip()).toBeNull();

    act(() => {
      trigger.focus();
    });

    const describedBy = trigger.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const card = tooltip();
    expect(card).not.toBeNull();
    expect(card!.id).toBe(describedBy);
    // Pattern tooltip, pas un déroulé : jamais `aria-expanded`.
    expect(trigger.hasAttribute("aria-expanded")).toBe(false);

    act(() => {
      trigger.blur();
    });

    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
    expect(tooltip()).toBeNull();
  });

  it("Échap ferme la carte ouverte", () => {
    const el = mount(
      <BookHoverCard data={DATA}>
        <span>Le Capital</span>
      </BookHoverCard>,
    );
    act(() => {
      rootTrigger(el).focus();
    });
    expect(tooltip()).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(tooltip()).toBeNull();
  });
});

describe("BookHoverCard — délais de survol", () => {
  it("ouvre 120ms après l'entrée du pointeur, pas avant", () => {
    vi.useFakeTimers();
    const el = mount(
      <BookHoverCard data={DATA}>
        <span>Le Capital</span>
      </BookHoverCard>,
    );
    const trigger = rootTrigger(el);

    act(() => {
      fireEnter(trigger);
    });
    expect(tooltip()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(119);
    });
    expect(tooltip()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(tooltip()).not.toBeNull();
  });

  it("ferme 100ms après le départ du pointeur — timer PARTAGÉ : passer du déclencheur à la carte annule la fermeture programmée", () => {
    vi.useFakeTimers();
    const el = mount(
      <BookHoverCard data={DATA}>
        <span>Le Capital</span>
      </BookHoverCard>,
    );
    const trigger = rootTrigger(el);

    act(() => {
      fireEnter(trigger);
      vi.advanceTimersByTime(120);
    });
    const card = tooltip();
    expect(card).not.toBeNull();

    // Le pointeur quitte le déclencheur POUR la carte, avant les 100ms.
    act(() => {
      fireLeave(trigger);
      vi.advanceTimersByTime(60);
    });
    expect(tooltip()).not.toBeNull();
    act(() => {
      fireEnter(card!);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // La fermeture programmée au départ du déclencheur a été annulée par
    // l'entrée sur la carte — toujours ouverte bien après les 100ms initiaux.
    expect(tooltip()).not.toBeNull();

    // Cette fois le pointeur quitte la carte pour de bon.
    act(() => {
      fireLeave(card!);
    });
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(tooltip()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(tooltip()).toBeNull();
  });
});

describe("BookHoverCard — inerte sans capacité de survol (matchMedia hover:none)", () => {
  it("ne pose ni tabIndex ni affordance, ne s'ouvre jamais au survol", () => {
    hoverNoneQuery = true;
    const el = mount(
      <BookHoverCard data={DATA}>
        <span>Le Capital</span>
      </BookHoverCard>,
    );
    const trigger = rootTrigger(el);
    expect(trigger.hasAttribute("tabindex")).toBe(false);

    act(() => {
      fireEnter(trigger);
    });
    expect(tooltip()).toBeNull();
  });
});

describe("BookHoverCard — portail", () => {
  it("rend la carte dans `document.body`, jamais comme descendant du conteneur de montage", () => {
    const el = mount(
      <BookHoverCard data={DATA}>
        <span>Le Capital</span>
      </BookHoverCard>,
    );
    act(() => {
      rootTrigger(el).focus();
    });
    const card = tooltip();
    expect(card).not.toBeNull();
    expect(el.contains(card)).toBe(false);
    expect(document.body.contains(card)).toBe(true);
  });
});

describe("BookHoverCard — contenu de la carte", () => {
  it("ne contient aucun élément interactif (règle nested-interactive)", () => {
    const el = mount(
      <BookHoverCard data={DATA}>
        <span>Le Capital</span>
      </BookHoverCard>,
    );
    act(() => {
      rootTrigger(el).focus();
    });
    const card = tooltip()!;
    expect(card.querySelectorAll("a, button, input, select, textarea, [tabindex]").length).toBe(0);
  });
});
