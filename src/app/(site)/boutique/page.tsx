import { permanentRedirect } from "next/navigation";

/**
 * Page « La boutique » supprimée (retour client 2026-07-23) : les goodies se
 * limitent à quelques articles suggérés au checkout du panier
 * (`GoodiesCheckout`, `/panier`) — les fiches `/boutique/[slug]` restent
 * accessibles en lien direct. Redirection permanente (308) vers le panier
 * plutôt que suppression de la route : `/boutique` reste une URL
 * potentiellement indexée/partagée qu'on ne veut pas faire tomber en 404.
 */
export default function BoutiquePage() {
  permanentRedirect("/panier");
}
