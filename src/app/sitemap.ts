import type { MetadataRoute } from "next";
import { getAllBookParams, getAllBoutiqueParams } from "@/lib/catalogue";
import { isCommerceNative } from "@/lib/env";

/**
 * Convention de fichier racine (`app/sitemap.ts`, hors des route groups) —
 * même raison qu'`app/robots.ts` : doit vivre à la racine littérale de `app/`
 * pour produire `/sitemap.xml`.
 *
 * Via la façade `@/lib/catalogue` (insensible au futur swap d'adaptateur
 * `CATALOGUE_SOURCE=pg`) : pages statiques du front + une entrée par fiche
 * livre (`getAllBookParams`, ~295 titres). ~310 URLs → un seul sitemap, pas
 * besoin de `generateSitemaps`.
 *
 * `/boutique` + une entrée par produit orphelin (`getAllBoutiqueParams`,
 * `origin: "boutique"`) : conditionnées à `COMMERCE_NATIVE=1` — même garde
 * que la route elle-même (`src/app/(site)/boutique/page.tsx`, qui redirige
 * vers `/catalogue` tant que le flag est à `0`) ; `getAllBoutiqueParams`
 * renvoie déjà `[]` à `0`, la garde explicite ici documente l'intention et
 * évite de dépendre silencieusement de ce détail d'implémentation.
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
  const boutiqueOnly = isCommerceNative() ? await getAllBoutiqueParams() : [];

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
