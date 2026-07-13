import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";
import {
  mergePageAPropos,
  mergePagesLegales,
  mergeReglagesSite,
  type PageAProposContent,
  type PagesLegalesContent,
  type ReglagesSiteContent,
} from "./site-content-core";

/**
 * Lecture server-only des globals « Contenus du site » via la Local API
 * Payload — pattern Highlight généralisé (`highlight.ts`) : toujours lus
 * depuis Postgres, hors du port `CatalogueSource`, quelle que soit
 * `CATALOGUE_SOURCE`. Chaque lecteur dégrade sur les textes par défaut
 * (fusion pure dans `site-content-core.ts`) sur toute erreur
 * Payload/Postgres — schéma pas encore migré, Neon indisponible… — plutôt
 * que de casser la page : global vide ou base absente = rendu actuel exact.
 */

export async function getPagesLegales(): Promise<PagesLegalesContent> {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.findGlobal({ slug: "pages-legales" });
    return mergePagesLegales(doc);
  } catch (err) {
    console.error(
      "[contenus] lecture Payload indisponible — pages légales servies avec leurs textes par défaut :",
      err,
    );
    return mergePagesLegales(null);
  }
}

export async function getReglagesSite(): Promise<ReglagesSiteContent> {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.findGlobal({ slug: "reglages-site" });
    return mergeReglagesSite(doc);
  } catch (err) {
    console.error(
      "[contenus] lecture Payload indisponible — réglages du site servis avec leurs valeurs par défaut :",
      err,
    );
    return mergeReglagesSite(null);
  }
}

export async function getPageAPropos(): Promise<PageAProposContent> {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.findGlobal({ slug: "page-a-propos" });
    return mergePageAPropos(doc);
  } catch (err) {
    console.error(
      "[contenus] lecture Payload indisponible — page À propos servie avec ses textes par défaut :",
      err,
    );
    return mergePageAPropos(null);
  }
}
