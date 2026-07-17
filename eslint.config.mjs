import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Fichiers générés par Payload / migrations — non lintés.
    "src/app/(payload)/**",
    "src/payload-types.ts",
    "src/migrations/**",
    // Worktrees git locaux (checkouts parallèles sous .claude/worktrees/) —
    // pollueraient `pnpm lint` dans le checkout principal, qui les voit comme
    // de simples sous-dossiers.
    ".claude/**",
  ]),
]);

export default eslintConfig;
