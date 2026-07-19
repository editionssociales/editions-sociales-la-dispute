import "server-only";
import config from "@payload-config";
import { getPayload, type DataFromGlobalSlug, type GlobalSlug } from "payload";
import {
  mergePageAPropos,
  mergePageSouscription,
  mergePagesLegales,
  mergeReglagesSite,
  type PageAProposContent,
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
 */
async function readGlobal<TSlug extends GlobalSlug, TContent>(
  slug: TSlug,
  merge: (doc: DataFromGlobalSlug<TSlug> | null) => TContent,
  degradedLabel: string,
): Promise<TContent> {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.findGlobal({ slug });
    return merge(doc);
  } catch (err) {
    console.error(`[contenus] lecture Payload indisponible — ${degradedLabel} :`, err);
    return merge(null);
  }
}

export async function getPagesLegales(): Promise<PagesLegalesContent> {
  return readGlobal(
    "pages-legales",
    mergePagesLegales,
    "pages légales servies avec leurs textes par défaut",
  );
}

/** Pied de page + SEO — champs du global `pages-legales` (onglets Pied / Réseaux / Référencement). */
export async function getReglagesSite(): Promise<ReglagesSiteContent> {
  return readGlobal(
    "pages-legales",
    mergeReglagesSite,
    "pied de page et référencement servis avec leurs valeurs par défaut",
  );
}

export async function getPageAPropos(): Promise<PageAProposContent> {
  return readGlobal(
    "page-a-propos",
    mergePageAPropos,
    "page À propos servie avec ses textes par défaut",
  );
}

export async function getPageSouscription(): Promise<PageSouscriptionContent> {
  return readGlobal(
    "page-souscription",
    mergePageSouscription,
    "page Souscription servie avec ses textes par défaut",
  );
}
