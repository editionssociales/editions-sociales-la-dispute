import type { MetadataRoute } from "next";
import { getAllBookParams, getAllBoutiqueParams } from "@/lib/catalogue";

/**
 * Convention de fichier racine (`app/sitemap.ts`, hors des route groups) —
 * même raison qu'`app/robots.ts` : doit vivre à la racine littérale de `app/`
 * pour produire `/sitemap.xml`.
 *
 * Via la façade `@/lib/catalogue` : pages statiques du front + une entrée
 * par fiche livre (`getAllBookParams`, ~295 titres), plus `/boutique` et une
 * entrée par article boutique-seul (`getAllBoutiqueParams`). ~330 URLs → un
 * seul sitemap, pas besoin de `generateSitemaps`.
 */

export const revalidate = 3600;

const STATIC_PATHS = [
  "/",
  "/catalogue",
  "/catalogue/editions-sociales",
  "/catalogue/la-dispute",
  // Pages de présentation par maison (retour client 2026-07-23). Pas de
  // `/editions` (index) ni de `/a-propos` : redirections permanentes vers
  // l'accueil — les lister ferait indexer des URLs sans contenu propre.
  "/editions/editions-sociales",
  "/editions/la-dispute",
  "/souscription",
  "/rencontres",
  "/contact",
  "/mentions-legales",
  "/confidentialite",
  "/cgv",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Slash final normalisé : évite un double slash si la variable d'env est
  // un jour saisie avec un `/` final (cf. `robots.ts`, même normalisation).
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://editionssociales.fr"
  ).replace(/\/+$/, "");
  const books = await getAllBookParams();
  const boutiqueOnly = await getAllBoutiqueParams();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${base}${path}`,
  }));

  const bookEntries: MetadataRoute.Sitemap = books.map(({ edition, slug }) => ({
    url: `${base}/catalogue/${edition}/${slug}`,
  }));

  const boutiqueEntries: MetadataRoute.Sitemap =
    boutiqueOnly.length > 0
      ? [
          { url: `${base}/boutique` },
          ...boutiqueOnly.map(({ slug }) => ({ url: `${base}/boutique/${slug}` })),
        ]
      : [];

  return [...staticEntries, ...bookEntries, ...boutiqueEntries];
}
