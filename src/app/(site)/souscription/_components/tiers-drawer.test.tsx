import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  RAIL_EDGE_TRANSITION_CLASS,
  RAIL_GRID_CLASS,
  RAIL_GRID_TRANSITION_CLASS,
  RAIL_INSET_TRANSITION_CLASS,
  RAIL_OPEN_PROPERTY,
  RAIL_WIDTH_CLASS,
} from "@/components/rail-inset";
import { TiersDrawer } from "./tiers-drawer";

/**
 * Le tiroir des paliers (`lg+`) et la feuille de bas d'écran (sous `lg`) sont
 * UNE grammaire de déroulé, pas deux. Ce fichier verrouille les points sur
 * lesquels une première tentative s'est cassée :
 *
 *  - le FAIL-OPEN : le HTML serveur rend le tiroir OUVERT, cartes comprises —
 *    jamais un état masqué (le dépôt s'est déjà fait mordre là-dessus sur la
 *    jauge) ;
 *  - la colonne vaut 380px ou 0, JAMAIS une valeur gonflée d'une réserve de
 *    poignée ;
 *  - la course est portée par les TROIS consommateurs de la largeur, à la
 *    même durée et sur la même courbe que la feuille mobile ;
 *  - le repli passe par `inert`, jamais par `visibility`/`hidden` ;
 *  - Échap n'est PAS écouté sur `document` : il ne ferme pas le tiroir depuis
 *    le champ « montant libre », qui vit pourtant dans le panneau ;
 */

const ROOT = process.cwd();
const read = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");

/** Course de la feuille de bas d'écran — la référence, pas une valeur locale. */
const DURATION = "540ms";
const CURVE = "cubic-bezier(0.65,0,0.35,1)";

beforeAll(() => {
  // jsdom (version du dépôt) n'expose pas `CSS.escape`, que le tiroir utilise
  // pour construire un sélecteur d'ancre — comme la feuille de bas d'écran.
  // Bouchon minimal : les ids de la page sont de simples mots.
  if (typeof globalThis.CSS === "undefined") {
    Object.defineProperty(globalThis, "CSS", {
      writable: true,
      value: { escape: (value: string) => value },
    });
  }
  // jsdom n'implémente pas `scrollIntoView` non plus : le tiroir l'appelle
  // pour amener une ancre en vue. Le fait qu'il défile est l'affaire du
  // navigateur ; ce qui se teste ici, c'est qu'il le fasse APRÈS le commit.
  if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  // jsdom n'implémente pas `matchMedia` : sans ce bouchon, `useMediaQuery`
  // jetterait. `matches: false` = « pas mobile » → régime tiroir, celui qu'on
  // teste (le régime feuille a ses propres garanties dans `bottom-sheet`).
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

// ------------------------------------------------------------- fail-open

/** Dix cartes de palier en doublure : le vrai rail traîne images et action Stripe. */
function Cartes() {
  return (
    <div id="paliers">
      {Array.from({ length: 10 }, (_, i) => (
        <article key={i}>Palier {i + 1}</article>
      ))}
      <div id="montant-libre">
        <input name="amount" />
      </div>
    </div>
  );
}

function parse(html: string): HTMLDivElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("TiersDrawer — fail-open sans JS", () => {
  it("rendu serveur : tiroir OUVERT, les dix cartes présentes, aucun état masqué", () => {
    const html = renderToStaticMarkup(
      <TiersDrawer anchors={["paliers", "montant-libre"]}>
        <Cartes />
      </TiersDrawer>,
    );
    const host = parse(html);

    const toggles = Array.from(host.querySelectorAll("button[aria-expanded]"));
    expect(toggles).toHaveLength(2);
    for (const toggle of toggles) {
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
    }

    const panelId = toggles[0]!.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = host.querySelector(`[id="${panelId}"]`);
    expect(panel).not.toBeNull();

    // Les dix cartes sont là, en clair, dans le HTML servi.
    for (let i = 1; i <= 10; i++) {
      expect(panel!.textContent).toContain(`Palier ${i}`);
    }
    // Ouvert : ni `inert` ...
    expect(panel!.hasAttribute("inert")).toBe(false);
    // ... ni masquage par classe. Comparaison sur les classes ENTIÈRES : une
    // regex `\bhidden\b` matcherait `overflow-x-clip`… et surtout `hidden`
    // dans d'autres utilitaires composés.
    const classes = panel!.className.split(/\s+/).filter(Boolean);
    expect(classes).not.toContain("hidden");
    expect(classes).not.toContain("invisible");
    expect(panel!.getAttribute("style") ?? "").not.toContain("visibility");
  });

  it("le HTML serveur ne pose JAMAIS `--rail-open` : le défaut CSS ouvre le tiroir", () => {
    const html = renderToStaticMarkup(
      <TiersDrawer>
        <Cartes />
      </TiersDrawer>,
    );
    expect(html).not.toContain(RAIL_OPEN_PROPERTY);
    // ... et c'est bien le repli `,1` des classes qui tient l'état ouvert.
    expect(RAIL_GRID_CLASS).toContain("var(--rail-open,1)");
    expect(RAIL_WIDTH_CLASS).toContain("var(--rail-open,1)");
  });
});

// ------------------------------------------------------------- géométrie

describe("TiersDrawer — la colonne vaut 380px ou 0, jamais autre chose", () => {
  it("aucune réserve de poignée n'est logée dans la largeur du rail", () => {
    for (const utility of [RAIL_GRID_CLASS, RAIL_WIDTH_CLASS]) {
      expect(utility).toContain("calc(380px*var(--rail-open,1))");
      // Une poignée logée DANS la colonne se lirait ici comme un terme
      // ajouté (`calc(2.75rem + 380px * …)`) : la colonne ne vaudrait plus
      // 380px ouverte, et laisserait une bande morte fermée.
      expect(utility).not.toMatch(/rem\s*\+/);
      expect(utility).not.toMatch(/\+\s*380px/);
    }
  });

  it("les TROIS consommateurs de la largeur partagent la course de la feuille mobile", () => {
    for (const utility of [
      RAIL_GRID_TRANSITION_CLASS,
      RAIL_INSET_TRANSITION_CLASS,
      RAIL_EDGE_TRANSITION_CLASS,
    ]) {
      expect(utility).toContain(DURATION);
      expect(utility).toContain(CURVE);
    }
    // La même que la feuille de bas d'écran — une seule et même grammaire.
    const sheet = read("src/components/bottom-sheet.tsx");
    expect(sheet).toContain(`duration-[${DURATION}]`);
    expect(sheet).toContain(`ease-[${CURVE}]`);
    // Et elle est RÉELLEMENT portée par la grille de page ET par la réserve
    // du header : sans ça la navbar sauterait pendant que la colonne glisse.
    // Assertion sur l'INTERPOLATION, pas sur le nom : une mention en
    // commentaire suffirait sinon à faire passer un consommateur qui ne
    // porte plus la classe (vérifié en cassant volontairement le header).
    expect(read("src/app/(site)/souscription/page.tsx")).toContain(
      "${RAIL_GRID_TRANSITION_CLASS}",
    );
    expect(read("src/components/site-header.tsx")).toContain(
      "${RAIL_INSET_TRANSITION_CLASS}",
    );
  });
});

// --------------------------------------------------------------- bascule

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

function panelOf(el: HTMLElement): HTMLElement {
  const id = el.querySelector("button[aria-controls]")!.getAttribute("aria-controls")!;
  return document.getElementById(id)!;
}

function closeButton(el: HTMLElement): HTMLButtonElement {
  return el.querySelector<HTMLButtonElement>("button[aria-label='Replier les contreparties']")!;
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
  document.documentElement.style.removeProperty(RAIL_OPEN_PROPERTY);
});

describe("TiersDrawer — bascule", () => {
  it("ferme au clic : panneau MONTÉ, sorti du clavier par `inert`, jamais par `hidden`", () => {
    const el = mount(
      <TiersDrawer>
        <Cartes />
      </TiersDrawer>,
    );
    const panel = panelOf(el);
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(document.documentElement.style.getPropertyValue(RAIL_OPEN_PROPERTY)).toBe("1");

    act(() => {
      closeButton(el).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(closeButton(el).getAttribute("aria-expanded")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(true);
    // Le contenu reste DANS le document, jamais démonté ni masqué.
    expect(panel.textContent).toContain("Palier 10");
    const classes = panel.className.split(/\s+/).filter(Boolean);
    expect(classes).not.toContain("hidden");
    expect(classes).not.toContain("invisible");
    // Les deux autres consommateurs de la largeur lisent cet état.
    expect(document.documentElement.style.getPropertyValue(RAIL_OPEN_PROPERTY)).toBe("0");
  });

  it("un CTA d'ancre de la page ouvre le tiroir refermé", () => {
    const el = mount(
      <TiersDrawer anchors={["paliers"]}>
        <Cartes />
      </TiersDrawer>,
    );
    act(() => {
      closeButton(el).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(panelOf(el).hasAttribute("inert")).toBe(true);

    // Le CTA vit dans la colonne principale, hors du composant.
    const cta = document.createElement("a");
    cta.setAttribute("href", "#paliers");
    document.body.appendChild(cta);
    act(() => {
      cta.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(panelOf(el).hasAttribute("inert")).toBe(false);
    expect(document.documentElement.style.getPropertyValue(RAIL_OPEN_PROPERTY)).toBe("1");
    cta.remove();
  });
});

describe("TiersDrawer — Échap n'est pas écouté sur `document`", () => {
  it("Échap dans le champ « montant libre » ne referme PAS le tiroir", () => {
    const el = mount(
      <TiersDrawer>
        <Cartes />
      </TiersDrawer>,
    );
    const input = el.querySelector("input")!;
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(panelOf(el).hasAttribute("inert")).toBe(false);
  });

  it("Échap sur le panneau referme le tiroir", () => {
    const el = mount(
      <TiersDrawer>
        <Cartes />
      </TiersDrawer>,
    );
    const panel = panelOf(el);
    act(() => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(panel.hasAttribute("inert")).toBe(true);
  });
});
