/**
 * Repli des couleurs translucides pour les vieux navigateurs (retour client
 * 2026-11 : « sur de vieux mobiles, les couleurs ne sont pas les bonnes »).
 *
 * Tailwind v4 compile `text-ink/40`, `bg-ink/25`, `border-ink/20`… en
 *
 *     @supports (color: color-mix(in lab, red, red)) {
 *       .text-ink\/40 { color: color-mix(in oklab, var(--color-ink) 40%, transparent); }
 *     }
 *
 * SANS déclaration de repli : un navigateur sans `color-mix` (Safari < 16.2,
 * Chrome < 111, Firefox < 113…) ignore tout le bloc, donc la classe n'existe
 * pas — le texte hérite d'une autre couleur (parfois ink sur ink, invisible),
 * le fond translucide disparaît. Ce plugin, joué APRÈS Tailwind, insère avant
 * chaque bloc une règle identique en `rgba()` calculée à partir du jeton
 * `--color-*` (lu dans la feuille elle-même, jamais recopié ici) : les
 * navigateurs modernes retombent sur le `color-mix` d'origine (même
 * spécificité, déclaré après), les vieux appliquent l'`rgba`.
 *
 * `currentcolor` (souligné, placeholder) n'a pas de repli chiffrable : le
 * comportement par défaut du navigateur s'y applique, acceptable.
 */

const SUPPORTS_MARK = "color-mix(in lab, red, red)";
const MIX =
  /color-mix\(\s*in\s+oklab\s*,\s*var\(\s*--color-([a-z0-9-]+)\s*\)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)/gi;

/** `#rgb` / `#rrggbb` → `[r, g, b]`, sinon `null`. */
export function hexToRgb(hex) {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** Remplace chaque `color-mix(... var(--color-X) N%, transparent)` résoluble par `rgba(r, g, b, N/100)` ; `null` si rien n'a pu l'être. */
export function mixToRgba(value, tokens) {
  let resolved = false;
  const out = value.replace(MIX, (whole, name, percent) => {
    const rgb = tokens.get(name);
    if (!rgb) return whole;
    resolved = true;
    const alpha = Math.round(parseFloat(percent) * 10) / 1000;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  });
  return resolved && !out.includes("color-mix(") ? out : null;
}

const plugin = () => ({
  postcssPlugin: "color-mix-fallback",
  Once(root) {
    // Jetons de couleur de la feuille : `--color-ink: #17140f` → ink.
    const tokens = new Map();
    root.walkDecls(/^--color-/, (decl) => {
      const rgb = hexToRgb(decl.value);
      if (rgb) tokens.set(decl.prop.slice("--color-".length), rgb);
    });
    if (tokens.size === 0) return;

    root.walkAtRules("supports", (atRule) => {
      if (!atRule.params.replace(/\s+/g, " ").includes(SUPPORTS_MARK)) return;
      atRule.each((child) => {
        if (child.type !== "rule") return;
        const fallback = child.clone();
        let changed = false;
        fallback.each((decl) => {
          if (decl.type !== "decl") return;
          const rgba = mixToRgba(decl.value, tokens);
          if (rgba) {
            decl.value = rgba;
            changed = true;
          } else {
            decl.remove();
          }
        });
        if (changed) atRule.before(fallback);
      });
    });
  },
});
plugin.postcss = true;

export default plugin;
