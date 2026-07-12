import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests unitaires des modules purs (logique de domaine, hors rendu) **et** de
 * la couche de composition (façades server-only, action Stripe, webhook —
 * réseau intercepté par msw). Environnement `node` : ces modules ne touchent
 * pas au DOM — c'est précisément l'objet des extractions (« l'interface est
 * la surface de test »).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Le marqueur `server-only` jette hors d'un build Next : on résout ici
      // son export `react-server` (fichier vide du paquet) pour tester la
      // couche de composition à travers ses interfaces réelles. La résolution
      // de prod est inchangée — le garde-fou joue toujours dans l'app.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
