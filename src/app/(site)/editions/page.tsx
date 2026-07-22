import { permanentRedirect } from "next/navigation";

/**
 * Page-index morte (chantier agenda/à-propos, 2026-07) : les deux maisons
 * vivent désormais sur la page commune `/a-propos` (cf. `NAV_HOUSES`,
 * `src/lib/nav.ts`). Redirection permanente (308) plutôt que suppression de
 * la route : `/editions` reste une URL potentiellement indexée/partagée
 * qu'on ne veut pas faire tomber en 404.
 */
export default function EditionsPage() {
  permanentRedirect("/a-propos");
}
