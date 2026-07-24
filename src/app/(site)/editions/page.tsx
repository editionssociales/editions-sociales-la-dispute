import { permanentRedirect } from "next/navigation";

/**
 * Page-index sans contenu propre : les maisons vivent chacune sur
 * `/editions/[slug]` (retour client 2026-07-23, cf. `NAV_HOUSES`,
 * `src/lib/nav.ts`). Redirection permanente (308) vers l'accueil plutôt que
 * suppression de la route : `/editions` reste une URL potentiellement
 * indexée/partagée qu'on ne veut pas faire tomber en 404.
 */
export default function EditionsPage() {
  permanentRedirect("/");
}
