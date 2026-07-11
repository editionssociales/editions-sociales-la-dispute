import type { MetadataRoute } from "next";
import { getAllBookParams } from "@/lib/catalogue";

/**
 * Convention de fichier racine (`app/sitemap.ts`, hors des route groups) —
 * même raison qu'`app/robots.ts` : doit vivre à la racine littérale de `app/`
 * pour produire `/sitemap.xml`.
 *
 * Via la façade `@/lib/catalogue` (insensible au futur swap d'adaptateur
 * `CATALOGUE_SOURCE=pg`) : pages statiques du front + une entrée par fiche
 * livre (`getAllBookParams`, ~295 titres). ~310 URLs → un seul sitemap, pas
 * besoin de `generateSitemaps`.
 */

export const revalidate = 3600; // aligne la fraîcheur sur la fenêtre de cache REST (WP_REVALIDATE)

const STATIC_PATHS = [
  "/",
  "/catalogue",
  "/catalogue/editions-sociales",
  "/catalogue/la-dispute",
  "/editions",
  "/editions/editions-sociales",
  "/editions/la-dispute",
  "/souscription",
  "/a-propos",
  "/rencontres",
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

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${base}${path}`,
  }));

  const bookEntries: MetadataRoute.Sitemap = books.map(({ edition, slug }) => ({
    url: `${base}/catalogue/${edition}/${slug}`,
  }));

  return [...staticEntries, ...bookEntries];
}
