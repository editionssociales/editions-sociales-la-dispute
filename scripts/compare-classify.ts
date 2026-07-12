/**
 * Classification pure des écarts http ⟷ pg — extrait de `compare-sources.ts`
 * pour rester testable.
 *
 * `compare-sources.ts` exécute son `main()` en haut de fichier dès que le
 * module est importé (top-level await, requis par `payload run` — cf.
 * `site/CLAUDE.md`) : un test qui l'importerait directement déclencherait une
 * vraie connexion Payload + des appels REST WordPress. Ce module-ci n'importe
 * ni Payload ni réseau — seulement la logique pure de classification —, donc
 * un test peut l'importer sans effet de bord (même raison que le découplage
 * `catalogue-core.ts` documenté en tête de `compare-sources.ts`).
 */
import { DEFAULT_COVER_RATIO } from "../src/lib/catalogue-wp-map.ts";
import type { Cover } from "../src/lib/types.ts";

export type Category = "bloquant" | "cosmetique" | "ignore";

export interface Diff {
  key: string;
  field: string;
  category: Category;
  detail: string;
}

export function diff(key: string, field: string, category: Category, detail: string): Diff {
  return { key, field, category, detail };
}

/**
 * Hôtes WordPress connus des deux fonds (couvertures/PDF/HTML éditorial) —
 * hors boutique. Inclut les hôtes de cohabitation `cms-es`/`cms-ld`
 * (`rebaseWpMediaUrl`, `src/lib/cms-html.ts`) : `cover.url` y est rebasé côté
 * http dès qu'il pointe `/wp-content/...` — sans ces deux entrées, TOUTE
 * couverture serait vue comme « hôte non identifiable » (bloquant), le
 * réhébergement OVH → Payload ne serait jamais reconnu pour ce champ.
 */
export const OVH_MEDIA_HOSTS = [
  "editionssociales.fr",
  "www.editionssociales.fr",
  "ladispute.fr",
  "www.ladispute.fr",
  "cms-es.editionssociales.fr",
  "cms-ld.editionssociales.fr",
];

/**
 * `boutique.editionssociales.fr` reste un hôte WooCommerce légitime pour les
 * liens/images d'achat (angle mort n°2 du plan — hors périmètre de la
 * migration média) : volontairement absent de `OVH_MEDIA_HOSTS`, sans quoi le
 * contrôle « 0 URL OVH résiduelle » lèverait un faux bloquant permanent sur
 * chaque fiche vendue en boutique.
 */

/**
 * Espaces insécables posées par l'orthotypographie française (E6 du plan —
 * NNBSP avant `; ! ?`, NBSP avant `:` et dans `« »`) : un texte identique une
 * fois ces espaces et les espaces normales normalisées n'est pas un défaut de
 * migration, seulement la fonctionnalité vendue en cours de pose.
 */
export function normalizeSpaces(s: string): string {
  // Espaces insécables (NBSP, NNBSP) posées par l'orthotypographie française
  // (E6) + variantes rares (espace fine, espace de chiffre) — en échappement
  // unicode explicite plutôt qu'en caractère littéral, pour rester lisibles
  // dans un éditeur/diff et ne pas déclencher `no-irregular-whitespace` en lint.
  return s.replace(/[\u00A0\u202F\u2009\u2007]/g, " ").replace(/\s+/g, " ").trim();
}

/** Neutralise les URL de `src=`/`href=` : un média réhébergé (OVH → Blob) ne doit pas se comparer par son URL. */
export function neutralizeMediaUrls(s: string): string {
  return s.replace(/\b(src|href)="[^"]*"/gi, '$1="§"');
}

/** Diff d'un champ HTML (déjà passé par `sanitizeCms`) : espaces/URL médias whitelistés en cosmétique. */
export function classifyHtml(key: string, field: string, a: string, b: string): Diff | null {
  if (a === b) return null;
  const na = normalizeSpaces(a);
  const nb = normalizeSpaces(b);
  if (na === nb) {
    return diff(key, field, "cosmetique", "espaces/insécables uniquement (orthotypographie E6 ou espacement source)");
  }
  if (neutralizeMediaUrls(na) === neutralizeMediaUrls(nb)) {
    return diff(key, field, "cosmetique", "URL de média différente, contenu identique (réhébergement OVH → Blob attendu)");
  }
  return diff(key, field, "bloquant", `contenu différent : "${a.slice(0, 120)}" ≠ "${b.slice(0, 120)}"`);
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Diff d'une URL de média simple (couverture, table, extrait) : changement
 * d'hébergeur = cosmétique, absence d'un côté = bloquant.
 *
 * Le côté pg n'est PAS forcément une URL absolue : Payload sert un chemin
 * relatif same-origin (`/api/media/file/<...>`, storage local — `hostOf` y
 * renvoie `null`, faute d'hôte à parser) tant que `BLOB_READ_WRITE_TOKEN`
 * n'active pas `vercelBlobStorage` (auquel cas l'URL devient absolue sur un
 * host `*.public.blob.vercel-storage.com`). Les deux formes sont un
 * réhébergement légitime — seul un host pg encore OVH serait le vrai bug
 * (réhébergement manqué).
 */
export function classifyMediaUrl(key: string, field: string, a: string | null, b: string | null): Diff | null {
  if (a === b) return null;
  if (a == null || b == null) {
    return diff(key, field, "bloquant", `présent d'un seul côté : http="${a ?? "∅"}" pg="${b ?? "∅"}"`);
  }
  const hostA = hostOf(a);
  if (!hostA || !OVH_MEDIA_HOSTS.includes(hostA)) {
    return diff(key, field, "bloquant", `URL différente sans réhébergement identifiable : "${a}" ≠ "${b}"`);
  }
  const hostB = hostOf(b);
  if (hostB && OVH_MEDIA_HOSTS.includes(hostB)) {
    return diff(key, field, "bloquant", `URL OVH inchangée côté pg — réhébergement manquant : "${a}" ≠ "${b}"`);
  }
  return diff(key, field, "cosmetique", `réhébergement attendu : ${a} → ${b}`);
}

/**
 * `cover.dims` : la couverture WP en forme "string" legacy (`toCover`,
 * `catalogue-wp-map.ts`) n'expose pas de vraies dimensions et retombe sur
 * `DEFAULT_COVER_RATIO` (2×3, jamais recadré côté rendu) — Payload, lui, a
 * toujours les dimensions réelles (`sharp`, posées à l'upload). Un WP resté
 * au ratio par défaut face à de vraies dimensions pg n'est pas une perte,
 * c'est la donnée qui arrive enfin.
 */
export function classifyCoverDims(key: string, http: Cover | null, pg: Cover | null): Diff | null {
  if (!http || !pg) return null; // présence/absence : déjà couvert par classifyMediaUrl(cover.url)
  if (http.width === pg.width && http.height === pg.height) return null;
  const httpIsFallback = http.width === DEFAULT_COVER_RATIO.width && http.height === DEFAULT_COVER_RATIO.height;
  const pgHasRealDims = pg.width !== DEFAULT_COVER_RATIO.width || pg.height !== DEFAULT_COVER_RATIO.height;
  if (httpIsFallback && pgHasRealDims) {
    return diff(
      key,
      "cover.dims",
      "cosmetique",
      `ratio par défaut WP (dimensions réelles non exposées par le REST) remplacé par les vraies dimensions pg : ${http.width}x${http.height} → ${pg.width}x${pg.height}`,
    );
  }
  return diff(key, "cover.dims", "bloquant", `${http.width}x${http.height} ≠ ${pg.width}x${pg.height}`);
}

/**
 * ISBN : `trimIsbn` (migration, `utils.ts:82`) nettoie les espaces parasites
 * connus côté LD (piège de l'échantillon E8) — un ISBN identique une fois
 * réduit aux espaces est une correction de qualité de donnée, pas une perte.
 */
export function classifyIsbn(key: string, a: string | null, b: string | null): Diff | null {
  if (a === b) return null;
  if ((a ?? "").trim() === (b ?? "").trim()) {
    return diff(key, "isbn", "cosmetique", `espace parasite nettoyé : "${a}" → "${b}"`);
  }
  return diff(key, "isbn", "bloquant", `isbn différent : "${a}" ≠ "${b}"`);
}

export function scalar(key: string, field: string, a: unknown, b: unknown): Diff | null {
  if (a === b) return null;
  return diff(key, field, "bloquant", `${field} : "${String(a)}" ≠ "${String(b)}"`);
}
