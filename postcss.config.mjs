import { fileURLToPath } from "node:url";

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // APRÈS Tailwind : repli `rgba()` des couleurs à opacité (`text-ink/40`)
    // pour les navigateurs sans `color-mix` — cf. le fichier. Chemin ABSOLU :
    // Turbopack évalue cette config hors de la racine du dépôt, un chemin
    // relatif n'y est pas résolu.
    [fileURLToPath(new URL("./scripts/postcss-color-mix-fallback.mjs", import.meta.url))]: {},
  },
};

export default config;
