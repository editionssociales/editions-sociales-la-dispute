/**
 * Pagination résiliente — pur, sans I/O (convention `src/lib/CLAUDE.md`).
 *
 * LA politique « tout récupérer, page à page, en dégradant » du contrat de
 * données : plafond de pages, arrêt à la première page courte, et **liste
 * partielle plutôt qu'exception** quand une page échoue. Écrite trois fois à
 * l'identique jusqu'ici (`catalogue-http.ts`, `boutique.ts`,
 * `scripts/compare-sources.ts`) ; le transport (URL, fetch, retry) reste à
 * l'appelant, injecté par `fetchPage`.
 */

export interface FetchAllPagesOptions {
  /**
   * Récupère une page (1-indexée). Jette sur échec réseau/HTTP ; un corps
   * inattendu peut être renvoyé tel quel (non-liste → arrêt silencieux, on
   * garde ce qu'on a) ou jeté par l'appelant s'il veut le voir signalé.
   */
  fetchPage(page: number): Promise<unknown>;
  /** Taille de page demandée — une page plus courte clôt la pagination. */
  perPage: number;
  /** Plafond dur de pages (garde-fou anti-boucle). */
  maxPages: number;
  /** Signalement d'une page en échec (l'appelant choisit quoi logger) ; la boucle s'arrête ensuite. */
  onPageError?(err: unknown, page: number): void;
}

/**
 * Concatène toutes les pages jusqu'à la première page courte, le plafond ou
 * le premier échec — auquel cas la liste déjà accumulée est renvoyée (jamais
 * d'exception : une source indisponible dégrade en liste partielle ou vide).
 * Les éléments ne sont pas validés ici : la forme relève du contrat de la
 * source, comme pour les casts existants des adaptateurs.
 */
export async function fetchAllPages<T>({
  fetchPage,
  perPage,
  maxPages,
  onPageError,
}: FetchAllPagesOptions): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    let items: unknown;
    try {
      items = await fetchPage(page);
    } catch (err) {
      onPageError?.(err, page);
      break;
    }
    // Corps 200 non-liste (erreur WP sérialisée, cache/proxy) : on garde ce qu'on a.
    if (!Array.isArray(items)) break;
    out.push(...(items as T[]));
    if (items.length < perPage) break;
  }
  return out;
}
