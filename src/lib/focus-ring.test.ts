import { readFileSync } from "node:fs";
import path from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import {
  FOCUS_RING_DARK,
  FOCUS_RING_HOVER_DARK,
  FOCUS_RING_HOVER_LIGHT,
  FOCUS_RING_INVERTING,
  FOCUS_RING_LIGHT,
} from "./ui";

/**
 * R5 — un anneau de focus de couleur FIXE ne tient pas sur une surface qui
 * change de fond au survol. Ce fichier verrouille les deux moitiés de la
 * parade posée dans `ui.ts` :
 *
 *  1. la MÉCANIQUE : `hover:focus-visible:outline-*` porte une pseudo-classe de
 *     plus que `focus-visible:outline-*`, donc une spécificité strictement plus
 *     haute — elle gagne quel que soit l'ordre d'écriture dans la feuille (le
 *     piège d'ordre de `Container.width`/`Button` ne mord pas ici) ;
 *  2. les CHIFFRES : les couples couleur d'anneau × fond qui justifient le
 *     choix de chaque token tiennent le seuil de 3:1 de WCAG 1.4.11, calculés
 *     depuis les jetons RÉELS de `globals.css`. Le jour où quelqu'un éclaircit
 *     `brick` ou assombrit `pop-orange`, c'est ici que ça casse — pas en prod.
 */

const ROOT = process.cwd();
const GLOBALS = path.join(ROOT, "src/app/(site)/globals.css");

// ---------------------------------------------------------------- contraste

/** Jetons `--color-*` du bloc `@theme`, lus à la source (jamais recopiés ici). */
function themeColors(): Record<string, string> {
  const css = readFileSync(GLOBALS, "utf8");
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]!] = m[2]!.toLowerCase();
  }
  return out;
}

/** Luminance relative WCAG 2.x d'un `#rrggbb`. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** Rapport de contraste WCAG entre deux jetons de `@theme`. */
function ratio(colors: Record<string, string>, a: string, b: string): number {
  const la = luminance(colors[a]!);
  const lb = luminance(colors[b]!);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Seuil des objets graphiques (WCAG 1.4.11) — celui d'un anneau de focus. */
const NON_TEXT_MIN = 3;

/** Fonds CLAIRS du site : ceux que borde un anneau `ink`. */
const LIGHT_SURFACES = ["paper", "paper-2", "pop-yellow", "pop-pink", "pop-teal", "pop-orange"];
/** Fonds SOMBRES du site : ceux que borde un anneau `paper` (ou `pop-yellow`). */
const DARK_SURFACES = ["ink", "navy", "brick", "bottle"];

describe("R5 — contraste des anneaux de focus (WCAG 1.4.11, seuil 3:1)", () => {
  const colors = themeColors();

  it("`ink` borde TOUS les fonds clairs du site", () => {
    for (const surface of LIGHT_SURFACES) {
      expect(colors[surface], `jeton --color-${surface} absent`).toBeDefined();
      expect(ratio(colors, "ink", surface)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    }
  });

  it("`paper` borde TOUS les fonds sombres du site", () => {
    for (const surface of DARK_SURFACES) {
      expect(colors[surface], `jeton --color-${surface} absent`).toBeDefined();
      expect(ratio(colors, "paper", surface)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    }
  });

  it("`pop-yellow` borde l'ink et les accents maison, mais PAS l'orange", () => {
    for (const surface of ["ink", "navy", "brick"]) {
      expect(ratio(colors, "pop-yellow", surface)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    }
    // C'est ce chiffre (2,99:1) qui a fait naître `FOCUS_RING_INVERTING`.
    expect(ratio(colors, "pop-yellow", "pop-orange")).toBeLessThan(NON_TEXT_MIN);
  });

  it("aucune couleur d'anneau ne tient les DEUX bouts d'une surface qui s'inverse", () => {
    // La raison d'être des surcharges : sur paper ↔ ink, `ink` meurt d'un côté
    // et `pop-yellow` de l'autre — d'où deux couleurs, pas une.
    expect(ratio(colors, "ink", "ink")).toBeLessThan(NON_TEXT_MIN);
    expect(ratio(colors, "pop-yellow", "paper")).toBeLessThan(NON_TEXT_MIN);
    expect(ratio(colors, "pop-yellow", "pop-yellow")).toBeLessThan(NON_TEXT_MIN);
  });
});

// ---------------------------------------------------------------- mécanique

async function compiledSheet(candidates: string[]): Promise<string> {
  const compiler = await compile(readFileSync(GLOBALS, "utf8"), {
    base: ROOT,
    loadStylesheet: async (id: string, base: string) => {
      const target =
        id === "tailwindcss"
          ? path.join(ROOT, "node_modules/tailwindcss/index.css")
          : path.resolve(base, id);
      return {
        path: target,
        base: path.dirname(target),
        content: readFileSync(target, "utf8"),
      };
    },
  });
  return compiler.build(candidates);
}

/**
 * Bloc complet (imbrication `&:hover { &:focus-visible { … } }` comprise) de la
 * règle générée pour une classe utilitaire — extrait par comptage d'accolades,
 * la règle de Tailwind v4 n'étant plus plate.
 */
function ruleOf(sheet: string, utility: string): string {
  const needle = `.${utility.replace(/:/g, "\\:")} {`;
  const start = sheet.indexOf(needle);
  if (start === -1) return "";
  let depth = 0;
  for (let i = start; i < sheet.length; i++) {
    if (sheet[i] === "{") depth++;
    else if (sheet[i] === "}" && --depth === 0) return sheet.slice(start, i + 1);
  }
  return "";
}

describe("R5 — mécanique de surcharge des anneaux au survol", () => {
  const BASE_COLOR = "focus-visible:outline-ink";
  const OVERRIDE_COLOR = "hover:focus-visible:outline-paper";

  it("les tokens de `ui.ts` sont bien les classes littérales attendues", () => {
    expect(FOCUS_RING_LIGHT).toContain(BASE_COLOR);
    expect(FOCUS_RING_DARK).toContain("focus-visible:outline-pop-yellow");
    expect(FOCUS_RING_HOVER_LIGHT).toBe("hover:focus-visible:outline-ink");
    expect(FOCUS_RING_HOVER_DARK).toBe(OVERRIDE_COLOR);
    // La composition nommée n'est QUE la somme des deux briques (distiller,
    // ne pas empiler) : aucune recette d'anneau parallèle à maintenir.
    expect(FOCUS_RING_INVERTING).toBe(`${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`);
  });

  it("la surcharge de survol compile ET porte une pseudo-classe de plus que la base", async () => {
    const sheet = await compiledSheet([BASE_COLOR, OVERRIDE_COLOR, FOCUS_RING_HOVER_LIGHT]);

    const base = ruleOf(sheet, BASE_COLOR);
    const override = ruleOf(sheet, OVERRIDE_COLOR);

    // 1. Les deux existent : le JIT n'a rien avalé (classes littérales).
    expect(base).not.toBe("");
    expect(override).not.toBe("");
    expect(ruleOf(sheet, FOCUS_RING_HOVER_LIGHT)).not.toBe("");

    // 2. Elles peignent bien les deux couleurs attendues.
    expect(base).toContain("outline-color: var(--color-ink)");
    expect(override).toContain("outline-color: var(--color-paper)");

    // 3. La base ne dépend QUE du focus ; la surcharge ajoute le survol —
    //    spécificité strictement plus haute, donc elle gagne quel que soit
    //    l'ordre d'écriture dans la feuille. Si Tailwind cessait un jour
    //    d'empiler les deux pseudo-classes sur le MÊME élément, cette
    //    assertion tomberait avant que l'anneau ne redevienne invisible.
    const pseudos = (rule: string) => (rule.match(/&:(?:hover|focus-visible)\b/g) ?? []).length;
    expect(base).toContain("&:focus-visible");
    expect(base).not.toContain("&:hover");
    expect(override).toContain("&:focus-visible");
    expect(override).toContain("&:hover");
    expect(pseudos(override)).toBeGreaterThan(pseudos(base));

    // 4. La surcharge est gardée par `@media (hover: hover)` — exactement comme
    //    le `hover:bg-*` qu'elle accompagne : là où le fond ne change pas
    //    (tactile), l'anneau de base reste seul, et il est juste.
    expect(override).toContain("@media (hover: hover)");
    expect(ruleOf(await compiledSheet(["hover:bg-ink"]), "hover:bg-ink")).toContain(
      "@media (hover: hover)",
    );
  });
});
