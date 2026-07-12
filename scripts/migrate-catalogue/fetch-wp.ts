/**
 * Source primaire de la migration : l'API REST des deux WordPress prod.
 *
 * Contrat consommé : `wp-headless/es-headless-rest.php` (champ consolidé
 * `book`). Health-check bruyant en tête (E9/E3) : protège le delta final d'un
 * cutover DNS intervenu entre-temps (un flip DNS sans découplage `cms-*` ferait
 * lire le **nouveau** site par ces mêmes URLs, en silence — cf. plan §E9).
 */
import type { WpBook } from "../../src/lib/catalogue-wp-map.ts";
import { fetchWithRetry, HttpError, type Logger, type Site } from "./utils.ts";

/**
 * Les formes du fil REST (`WpBook`, champ `book` consolidé par le mu-plugin
 * `es_headless_book_payload`) sont importées — types seuls — de
 * `catalogue-wp-map.ts` : une seule déclaration du contrat, la dérive entre
 * migration et front échoue au typecheck au lieu d'être absorbée par un cast.
 * Contexte vérifié en prod le 09/07 (échantillonnage 295/295) : le mu-plugin
 * déployé est l'ancienne révision → `cover` y est une **string** (URL servie),
 * jamais l'objet `{url,width,height}` visé par P4 — les 3 formes sont tolérées
 * par le type partagé.
 */
export type { WpBookField } from "../../src/lib/catalogue-wp-map.ts";

/** Fiche REST consommée par la migration : la forme du fil + `post_date`. */
export interface WpCatalogueRaw extends WpBook {
  /** `post_date` WP, ISO local — devient `sortDate` tel quel. */
  date: string;
}

export const SITE_BASES: Record<Site, string> = {
  es: process.env.WP_ES_URL || "https://editionssociales.fr",
  ld: process.env.WP_LD_URL || "https://ladispute.fr",
};

const PER_PAGE = 100;

/**
 * Health-check obligatoire : 200 **et** champ `book` présent sur la 1ʳᵉ fiche.
 * Échec bruyant (throw) — jamais de dégradation silencieuse ici, contrairement
 * à l'adaptateur http de prod (`catalogue-http.ts`) qui, lui, doit rester
 * résilient pour le front.
 */
export async function healthCheck(site: Site): Promise<void> {
  const base = SITE_BASES[site];
  const url = `${base}/wp-json/wp/v2/catalogue?per_page=1&_fields=id,book`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, { headers: { Accept: "application/json" } }, { retries: 3 });
  } catch (err) {
    throw new Error(
      `[health-check] ${site} (${base}) injoignable : ${err instanceof Error ? err.message : err}. ` +
        `Vérifier que ${base} est bien le WordPress source (pas un cutover DNS sans découplage cms-*).`,
    );
  }
  if (!res.ok) {
    throw new Error(`[health-check] ${site} (${base}) → HTTP ${res.status} (attendu 200).`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`[health-check] ${site} (${base}) → réponse non-JSON.`);
  }
  const first = Array.isArray(body) ? body[0] : undefined;
  if (!first || typeof first !== "object" || !("book" in (first as object))) {
    throw new Error(
      `[health-check] ${site} (${base}) → champ "book" absent de la réponse. ` +
        `Le mu-plugin wp-headless est-il bien déployé sur cette URL ?`,
    );
  }
  if ((first as { book?: unknown }).book == null) {
    throw new Error(
      `[health-check] ${site} (${base}) → "book" est null sur la 1ʳᵉ fiche : contrat non rempli.`,
    );
  }
}

async function wpGet<T>(url: string): Promise<{ body: T; total: number; totalPages: number }> {
  const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new HttpError(url, res.status);
  const rawTotal = res.headers.get("x-wp-total");
  const rawTotalPages = res.headers.get("x-wp-totalpages");
  // Échec BRUYANT si les en-têtes de pagination manquent (proxy/CDN qui les
  // filtrerait) : sans eux, la collecte s'arrêterait silencieusement à la
  // 1ʳᵉ page et le balayage des suppressions drafterait en masse des fiches
  // saines au delta final.
  if (rawTotal == null || rawTotalPages == null) {
    throw new Error(`[fetch-wp] en-têtes x-wp-total/x-wp-totalpages absents sur ${url} — collecte non fiable, abandon.`);
  }
  const body = (await res.json()) as T;
  return { body, total: Number(rawTotal), totalPages: Number(rawTotalPages) || 1 };
}

/** Pagination complète (`per_page=100`, lit `x-wp-totalpages`) — fiches complètes. */
export async function fetchCatalogue(site: Site, logger: Logger): Promise<WpCatalogueRaw[]> {
  const base = SITE_BASES[site];
  const fields = "id,slug,title,content,book,date";
  const out: WpCatalogueRaw[] = [];
  let page = 1;
  let totalPages = 1;
  let expectedTotal = 0;
  do {
    const url = `${base}/wp-json/wp/v2/catalogue?per_page=${PER_PAGE}&page=${page}&_fields=${fields}`;
    const { body, total, totalPages: tp } = await wpGet<WpCatalogueRaw[]>(url);
    totalPages = tp;
    expectedTotal = total;
    if (!Array.isArray(body)) {
      throw new Error(`[fetch-wp] ${site} page ${page} : réponse inattendue (pas une liste).`);
    }
    out.push(...body);
    page++;
  } while (page <= totalPages);
  if (out.length !== expectedTotal) {
    throw new Error(
      `[fetch-wp] ${site} : ${out.length} fiches collectées mais x-wp-total annonce ${expectedTotal} — collecte incomplète, abandon (protège le balayage des suppressions).`,
    );
  }
  logger.info(`[fetch-wp] ${site} : ${out.length} fiches récupérées (${totalPages} page(s)).`);
  return out;
}

interface WpTerm {
  id: number;
  slug: string;
  name: string;
}

/**
 * Fiches taguées taxonomie `parution` (flag « à paraître », ~5 fiches au
 * total) : termes de la taxo, puis fiches par terme.
 */
export async function fetchAParaitreIds(site: Site, logger: Logger): Promise<Set<number>> {
  const base = SITE_BASES[site];
  const ids = new Set<number>();
  let terms: WpTerm[];
  try {
    const res = await fetchWithRetry(`${base}/wp-json/wp/v2/parution?per_page=100`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      logger.warn(`[fetch-wp] ${site} : taxonomie "parution" injoignable (HTTP ${res.status}).`);
      return ids;
    }
    const body = await res.json();
    terms = Array.isArray(body) ? body : [];
  } catch (err) {
    logger.warn(
      `[fetch-wp] ${site} : taxonomie "parution" injoignable (${err instanceof Error ? err.message : err}).`,
    );
    return ids;
  }
  for (const term of terms) {
    try {
      const res = await fetchWithRetry(
        `${base}/wp-json/wp/v2/catalogue?parution=${term.id}&_fields=id&per_page=100`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) continue;
      const body = (await res.json()) as { id: number }[];
      if (Array.isArray(body)) body.forEach((b) => ids.add(b.id));
    } catch (err) {
      logger.warn(
        `[fetch-wp] ${site} : lecture du terme "parution" #${term.id} échouée (${err instanceof Error ? err.message : err}).`,
      );
    }
  }
  logger.info(`[fetch-wp] ${site} : ${ids.size} fiche(s) « à paraître ».`);
  return ids;
}
