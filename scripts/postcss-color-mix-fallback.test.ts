import postcss from "postcss";
import { describe, expect, it } from "vitest";
import plugin, { hexToRgb, mixToRgba } from "./postcss-color-mix-fallback.mjs";

const SUPPORTS = "@supports (color:color-mix(in lab, red, red))";
const THEME = ":root{--color-ink:#17140f;--color-paper:#faf7f2;--color-pop-orange:#ec6b06}";

async function run(css: string): Promise<string> {
  return (await postcss([plugin()]).process(css, { from: undefined })).css;
}

describe("color-mix-fallback — repli rgba() des couleurs à opacité", () => {
  it("insère AVANT le @supports une règle rgba() calculée depuis le jeton", async () => {
    const css = await run(
      `${THEME}${SUPPORTS}{.text-ink\\/40{color:color-mix(in oklab, var(--color-ink) 40%, transparent)}}`,
    );
    const fallbackAt = css.indexOf("rgba(23, 20, 15, 0.4)");
    expect(fallbackAt).toBeGreaterThan(-1);
    expect(fallbackAt).toBeLessThan(css.indexOf("@supports"));
    // Le color-mix d'origine reste, pour les navigateurs modernes.
    expect(css).toContain("color-mix(in oklab, var(--color-ink) 40%, transparent)");
  });

  it("fond et bordure : chaque propriété reçoit son repli (jetons paper, 25 %, 70 %)", async () => {
    const css = await run(
      `${THEME}${SUPPORTS}{.bg-ink\\/25{background-color:color-mix(in oklab, var(--color-ink) 25%, transparent)}}` +
        `${SUPPORTS}{.text-paper\\/70{color:color-mix(in oklab, var(--color-paper) 70%, transparent)}}`,
    );
    const compact = css.replace(/\s+/g, "");
    expect(compact).toContain("background-color:rgba(23,20,15,0.25)");
    expect(compact).toContain("color:rgba(250,247,242,0.7)");
  });

  it("currentcolor (souligné, placeholder) : pas de repli inventé", async () => {
    const css = await run(
      `${THEME}${SUPPORTS}{.decoration-current\\/40{text-decoration-color:color-mix(in oklab, currentcolor 40%, transparent)}}`,
    );
    expect(css).not.toContain("rgba(");
  });

  it("un @supports sans rapport n'est pas touché", async () => {
    const input = `${THEME}@supports (display:grid){.a{color:red}}`;
    expect(await run(input)).toBe(input);
  });

  it("hexToRgb / mixToRgba", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#ec6b06")).toEqual([236, 107, 6]);
    expect(hexToRgb("rgb(1,2,3)")).toBeNull();
    const tokens = new Map([["ink", [23, 20, 15]]]);
    expect(mixToRgba("color-mix(in oklab, var(--color-ink) 30%, transparent)", tokens)).toBe(
      "rgba(23, 20, 15, 0.3)",
    );
    expect(mixToRgba("color-mix(in oklab, var(--color-inconnu) 30%, transparent)", tokens)).toBeNull();
  });
});
