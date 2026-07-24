import { permanentRedirect } from "next/navigation";

/**
 * Page commune « Qui sommes-nous ? » supprimée (retour client 2026-07-23) :
 * chaque maison a désormais sa propre page `/editions/[slug]` (cf.
 * `NAV_HOUSES`, `src/lib/nav.ts`). Redirection permanente (308) plutôt que
 * suppression de la route : `/a-propos` reste une URL potentiellement
 * indexée/partagée qu'on ne veut pas faire tomber en 404.
 */
export default function AProposPage() {
  permanentRedirect("/");
}
