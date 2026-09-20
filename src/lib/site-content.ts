import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import config from "@payload-config";
import { getPayload, type DataFromGlobalSlug, type GlobalSlug } from "payload";
import {
  mergePageAPropos,
  mergePageContact,
  mergePageSouscription,
  mergePagesLegales,
  mergeReglagesSite,
  type PageAProposContent,
  type PageContactContent,
  type PageSouscriptionContent,
  type PagesLegalesContent,
  type ReglagesSiteContent,
} from "./site-content-core";

/**
 * Lecture server-only des globals « Contenus du site » via la Local API
 * Payload — pattern Highlight généralisé (`highlight.ts`) : toujours lus
 * depuis Postgres, hors du port `CatalogueSource`. Toute la mécanique
 * (lecture, dégradation sur les
 * textes par défaut — fusion pure dans `site-content-core.ts` — sur toute
 * erreur Payload/Postgres : schéma pas encore migré, Neon indisponible…)
 * vit UNE fois dans `readGlobal` ; chaque global éditable coûte une ligne,
 * qui ne fixe que le couple slug ↔ fusion. Global vide ou base absente =
 * rendu actuel exact, jamais une page cassée.
 *
 * `readGlobal` elle-même n'est pas mémoïsée (ses arguments `merge`/
 * `degradedLabel` sont de nouvelles closures à chaque appel — `cache()` les
 * distinguerait par référence, donc ne dédupliquerait jamais). Chaque getter
 * exporté ci-dessous est mémoïsé individuellement à la place, même patron que
 * `catalogue.ts:getAllBooks`/`getBook` : `getReglagesSite()` est notamment
 * appelée deux fois dans `(site)/layout.tsx`, une lecture Payload par appel
 * sans ce `cache()`.
 *
 * Data-cache tagué PAR GLOBAL (`site-global:<slug>`, 86400 s en filet —
 * incident Neon 2026-09-19) : le layout lit `pages-legales` à CHAQUE rendu,
 * donc à chaque requête des routes dynamiques (`/catalogue?…`, `/panier`,
 * 404) — sans data-cache, chacune réveillait Postgres : un robot d'indexation
 * suffit alors à tenir le compute Neon éveillé en continu (autosuspend à
 * 5 min jamais atteint), cause probable de l'épuisement du quota mensuel du
 * plan Free. Fraîcheur : les hooks des globals expirent
 * le tag à l'écriture (`revalidate.ts:invalidateSiteGlobalTag`, MÊME chaîne
 * littérale des deux côtés, comme `catalogue`). Le doc BRUT est caché, jamais
 * le résultat fusionné : une lecture en échec JETTE dans `loadGlobal` (rien
 * n'est mis en cache) et c'est `readGlobal` qui dégrade — cacher 24 h des
 * textes par défaut serait pire que la panne.
 */
async function loadGlobal<TSlug extends GlobalSlug>(
  slug: TSlug,
): Promise<DataFromGlobalSlug<TSlug>> {
  const payload = await getPayload({ config });
  return payload.findGlobal({ slug });
}

// `unstable_cache` exige un store Next (absent sous Vitest) — même garde que
// `catalogue.ts`.
function loadGlobalCached<TSlug extends GlobalSlug>(
  slug: TSlug,
): Promise<DataFromGlobalSlug<TSlug>> {
  if (process.env.VITEST === "true") return loadGlobal(slug);
  return unstable_cache(() => loadGlobal(slug), ["site-global-v1", slug], {
    revalidate: 86400,
    tags: [`site-global:${slug}`],
  })();
}

async function readGlobal<TSlug extends GlobalSlug, TContent>(
  slug: TSlug,
  merge: (doc: DataFromGlobalSlug<TSlug> | null) => TContent,
  degradedLabel: string,
): Promise<TContent> {
  try {
    return merge(await loadGlobalCached(slug));
  } catch (err) {
    console.error(`[contenus] lecture Payload indisponible — ${degradedLabel} :`, err);
    return merge(null);
  }
}

export const getPagesLegales = cache(async (): Promise<PagesLegalesContent> => {
  return readGlobal(
    "pages-legales",
    mergePagesLegales,
    "pages légales servies avec leurs textes par défaut",
  );
});

/** Pied de page + SEO — champs du global `pages-legales` (onglets Pied / Réseaux / Référencement). */
export const getReglagesSite = cache(async (): Promise<ReglagesSiteContent> => {
  return readGlobal(
    "pages-legales",
    mergeReglagesSite,
    "pied de page et référencement servis avec leurs valeurs par défaut",
  );
});

export const getPageAPropos = cache(async (): Promise<PageAProposContent> => {
  return readGlobal(
    "page-a-propos",
    mergePageAPropos,
    "page À propos servie avec ses textes par défaut",
  );
});

export const getPageSouscription = cache(async (): Promise<PageSouscriptionContent> => {
  return readGlobal(
    "page-souscription",
    mergePageSouscription,
    "page Souscription servie avec ses textes par défaut",
  );
});

export const getPageContact = cache(async (): Promise<PageContactContent> => {
  return readGlobal(
    "page-contact",
    mergePageContact,
    "page Contact servie avec ses textes par défaut",
  );
});
