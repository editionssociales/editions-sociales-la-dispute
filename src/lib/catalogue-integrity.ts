/**
 * Garde-fou court terme contre le catalogue tronqué en silence (DEVOPS.md
 * §5) — pur, sans I/O.
 *
 * `fetchAllPages` (via `catalogue-http.ts`) dégrade toute page WordPress en
 * échec en LISTE PARTIELLE plutôt qu'en exception (contrat de dégradation du
 * dossier, cf. `CLAUDE.md`) : une bonne politique pour une lecture isolée
 * (`getBook`), un risque pour le catalogue complet — un rate-limit ou un 5xx
 * sur la page 2 d'un fonds pendant un build laisserait passer un catalogue
 * amputé, mis en cache ISR une heure, avec des fiches réelles pré-rendues en
 * 404 sans qu'aucune alerte ne se déclenche.
 *
 * Ce module compare le total collecté (les deux fonds, avant fusion boutique)
 * au dernier chiffre connu et fait échouer l'appelant au-delà d'un écart de
 * 5 % — jamais un plancher/plafond fixe : le catalogue grossit à chaque
 * parution, un ratio absorbe cette dérive normale sans qu'il faille retoucher
 * la constante à chaque nouveau titre.
 *
 * Appelé depuis `catalogue.ts:getAllBooks()` — seul point qui combine les
 * deux fonds avant fusion/cache. L'échec ne frappe une page **déjà en cours
 * de service** que pour les routes réellement statiques/ISR : le build
 * (`generateStaticParams` → `getAllBookParams`, rien à perdre — un catalogue
 * tronqué ne doit jamais être pré-rendu) et la revalidation ISR d'une fiche
 * livre déjà pré-rendue (`catalogue/[edition]/[slug]`) — Next y conserve le
 * rendu précédent plutôt que de l'écraser par un résultat tronqué (comportement
 * voulu, DEVOPS.md §5).
 *
 * **`catalogue` et `catalogue/[edition]` ne sont PAS dans ce cas** : ces deux
 * routes lisent `searchParams` et sont donc rendues dynamiquement à CHAQUE
 * requête (`src/app/CLAUDE.md`) — `revalidate` n'y borne que la Data Cache
 * sous-jacente, pas le HTML. Un throw pendant une fenêtre de flakiness
 * WordPress y remonte donc jusqu'au rendu du Server Component pour chaque
 * visiteur de cette fenêtre. Deux frontières absorbent ce cas (constat de
 * revue, corrigé dans ce même lot) : `error.tsx` sous `(site)/catalogue/` et
 * `(site)/` dégrade ce throw en état « catalogue indisponible, réessayer »
 * plutôt qu'en page d'erreur 500 générique servie au public ; côté client,
 * `panier/actions.ts:getCartSnapshot` (appelée depuis un simple effet, hors
 * du rendu — un `error.tsx` ne la couvre pas) est entourée d'un `try/catch`
 * dans `cart-view.tsx` qui affiche un message dégradé sans jamais vider le
 * panier de l'utilisateur.
 *
 * Mesure temporaire : disparaît à la phase 3 (source PostgreSQL — une
 * transaction remplace ~300 requêtes HTTP, une lecture partielle n'est plus
 * représentable, DEVOPS.md §5).
 */

/**
 * Dernier chiffre connu (relevé DEVOPS.md §1.3/§5, 2026-07-09 : 295 fiches,
 * 117 ES + 178 LD) — à AJUSTER au fil des nouvelles parutions ; une valeur
 * périmée ne fait que déplacer la fenêtre tolérée, jamais planter à tort tant
 * que le catalogue n'a pas dérivé de plus de `CATALOGUE_SIZE_TOLERANCE`.
 */
export const KNOWN_CATALOGUE_SIZE = 295;

/** Tolérance : au-delà, la collecte est jugée tronquée plutôt qu'en dérive normale (DEVOPS.md §5 : « ~5 % »). */
export const CATALOGUE_SIZE_TOLERANCE = 0.05;

/** Jetée par `assertCatalogueComplete` — porte le compte, la référence et l'écart pour les logs de build/ISR. */
export class CatalogueTruncatedError extends Error {
  constructor(count: number, known: number, tolerance: number) {
    super(
      `catalogue tronqué : ${count} livres collectés (deux fonds), écart > ${Math.round(
        tolerance * 100,
      )}% du dernier chiffre connu (${known}). Collecte probablement interrompue par une page ` +
        `WordPress en échec (\`fetchAllPages\` dégrade en liste partielle, jamais en exception) — ` +
        `refus de construire/mettre en cache un catalogue amputé (DEVOPS.md §5). Si ce total est ` +
        `désormais correct (nouvelles parutions), ajuster \`KNOWN_CATALOGUE_SIZE\` (catalogue-integrity.ts).`,
    );
    this.name = "CatalogueTruncatedError";
  }
}

/**
 * Jette `CatalogueTruncatedError` si `count` s'écarte de plus de `tolerance`
 * du dernier chiffre `known`. `known <= 0` désactive le garde-fou (pas de
 * référence exploitable — évite une division par zéro et un faux positif
 * avant tout premier catalogue peuplé).
 */
export function assertCatalogueComplete(
  count: number,
  known: number = KNOWN_CATALOGUE_SIZE,
  tolerance: number = CATALOGUE_SIZE_TOLERANCE,
): void {
  if (known <= 0) return;
  const drift = Math.abs(count - known) / known;
  if (drift > tolerance) {
    throw new CatalogueTruncatedError(count, known, tolerance);
  }
}
