import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests unitaires des modules purs (logique de domaine, hors I/O réseau et hors
 * rendu). Environnement `node` : ces modules ne touchent pas au DOM — c'est
 * précisément l'objet des extractions (« l'interface est la surface de test »).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
