import * as Sentry from "@sentry/nextjs";
import { getSearchSuggestions } from "@/lib/catalogue";
import { emptySuggestionIndexData } from "@/lib/search-suggest-core";

/**
 * `GET /api/catalogue/suggestions` — index de complétion de la barre de
 * recherche catalogue (titres/auteurs/libellés, ~300 fiches). Le client le
 * charge UNE fois au premier focus du champ puis filtre en mémoire à chaque
 * frappe (`catalogue-search-box.tsx`) — jamais une requête par frappe.
 *
 * Route dynamique (défaut Next 16 des handlers GET), mais la donnée vient du
 * data-cache tagué `catalogue` (`getSearchSuggestions` →
 * `getCatalogueBooks`) : même fraîcheur par purges ciblées que la grille,
 * sans requête Postgres par appel.
 *
 * Dégrade en index VIDE, jamais un 500 nu (même contrat que `/api/health`) :
 * sans index, la complétion est simplement absente — la recherche par la
 * grille, elle, reste entière.
 */
export async function GET(): Promise<Response> {
  try {
    return Response.json(await getSearchSuggestions());
  } catch (err) {
    Sentry.captureException(err);
    return Response.json(emptySuggestionIndexData());
  }
}
