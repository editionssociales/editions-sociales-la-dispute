import { permanentRedirect } from "next/navigation";

/**
 * `/editions/[slug]` est un contenu mort (chantier agenda/à-propos, 2026-07) :
 * les deux maisons vivent désormais sur la page commune `/a-propos` (cf.
 * `NAV_HOUSES`, `src/lib/nav.ts`). Redirection permanente (308) plutôt que
 * suppression de la route : les deux slugs restent des URLs indexées/
 * partagées (SEO, liens externes) qu'on ne veut pas faire tomber en 404.
 * `generateStaticParams` reste utile au routing : il pré-rend la redirection
 * pour les deux slugs connus au lieu de la calculer à la demande.
 */

export function generateStaticParams() {
  return [{ slug: "editions-sociales" }, { slug: "la-dispute" }];
}

export default function EditionPage() {
  permanentRedirect("/a-propos");
}
