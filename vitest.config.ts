import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Deux projets Vitest (`test.projects`, remplace l'ancien
 * `vitest.workspace.ts`), chacun `extends: true` pour hériter du reste de ce
 * fichier (l'alias `@`, la résolution `server-only`) :
 *
 * - `node` : modules purs (logique de domaine, hors rendu) **et** couche de
 *   composition (façades server-only, action Stripe, webhook — réseau
 *   intercepté par msw). Ces modules ne touchent pas au DOM — c'est
 *   précisément l'objet des extractions (« l'interface est la surface de
 *   test »). Comportement inchangé par rapport à l'ancien projet unique.
 * - `jsdom` : réservé aux tests de composants (`*.test.tsx`) — aucun
 *   n'existe encore dans le dépôt (`jsdom` était une dépendance installée
 *   mais jamais câblée). Un futur test de composant importera
 *   `@testing-library/react` (à ajouter en devDependency au moment venu,
 *   absent pour l'instant) et le composant testé via l'alias `@/...`.
 */
const serverOnlyAlias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // Le marqueur `server-only` jette hors d'un build Next : on résout ici
  // son export `react-server` (fichier vide du paquet) pour tester la
  // couche de composition à travers ses interfaces réelles. La résolution
  // de prod est inchangée — le garde-fou joue toujours dans l'app.
  "server-only": fileURLToPath(
    new URL("./node_modules/server-only/empty.js", import.meta.url),
  ),
};

export default defineConfig({
  resolve: {
    alias: serverOnlyAlias,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          // `scripts/**` : cœur pur des scripts de migration (matching
          // WooCommerce, `migrate-products-core.ts`, classifieur
          // compare-sources) — même exigence de test que `src/lib`, sans
          // faire de ce dossier une dépendance du build.
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
  },
});
