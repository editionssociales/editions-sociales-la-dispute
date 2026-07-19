import { notFound } from "next/navigation";

/**
 * Catch-all des URLs qui ne correspondent à aucune route : sans root layout
 * commun (multi-root-layouts, cf. `src/app/CLAUDE.md`), une URL inconnue
 * tomberait sinon sur la 404 par défaut de Next (anglaise, hors charte).
 * Ce segment aspire tout le reste dans le groupe `(site)` et délègue à
 * `(site)/not-found.tsx` (la 404 brandée), chrome du site compris.
 * `/admin`, `/api` et les conventions racine (robots, sitemap, favicon)
 * restent prioritaires : un segment explicite gagne toujours sur un catch-all.
 */
export default function CatchAllNotFound(): never {
  notFound();
}
