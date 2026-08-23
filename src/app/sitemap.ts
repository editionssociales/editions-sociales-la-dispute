import type { MetadataRoute } from "next";
import { getAllBooks, getBoutiqueBooks } from "@/lib/catalogue";
import type { Book, EditionSlug } from "@/lib/types";

/**
 * Convention de fichier racine (`app/sitemap.ts`, hors des route groups) —
 * même raison qu'`app/robots.ts` : doit vivre à la racine littérale de `app/`
 * pour produire `/sitemap.xml`.
 *
 * Via la façade `@/lib/catalogue` : pages statiques du front + une entrée
 * par fiche livre (~295 titres), plus `/boutique` et une entrée par article
 * boutique-seul. ~330 URLs → un seul sitemap, pas besoin de
 * `generateSitemaps`.
 *
 * `lastModified` (issue #87e) : dérivé de `publishedAt` (`Book`, ISO
 * `YYYY-MM-DD`) sur les entrées livre/boutique — SEUL champ date déjà exposé
 * par `Book` sans élargir ce type (pas de `updatedAt` distinct sur ce
 * modèle). On lit `getAllBooks`/`getBoutiqueBooks` (déjà exportés, données
 * complètes, même data-cache tagué `catalogue`). Ce module est la SEULE
 * lecture catalogue restante au build depuis que les fiches sont lazy
 * (`generateStaticParams` vide, quota Neon) — avec l'accueil, la
 * souscription et le panier, tous dédupliqués sur la même rafale. Absent
 * (`null`) → pas de `lastModified` sur cette entrée plutôt qu'une date
 * inventée. Pages statiques (contenu éditorial Payload sans date exposée
 * ici) : pas de `lastModified` non plus.
 */

// Fenêtre ISR 24 h — filet seulement : le sitemap est purgé à l'édition
// catalogue (`/sitemap.xml` dans CATALOGUE_LITERAL_PATHS, audit coûts Vercel
// 2026-08-23).
export const revalidate = 86400;

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
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://ld-es.fr"
  ).replace(/\/+$/, "");
  const allBooks = await getAllBooks();
  const books = allBooks.filter(
    (b): b is Book & { edition: EditionSlug } => b.edition != null,
  );
  const boutiqueOnly = await getBoutiqueBooks();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${base}${path}`,
  }));

  const bookEntries: MetadataRoute.Sitemap = books.map(({ edition, slug, publishedAt }) => ({
    url: `${base}/catalogue/${edition}/${slug}`,
    ...(publishedAt ? { lastModified: publishedAt } : {}),
  }));

  // Pas de `/boutique` (liste) : redirection permanente vers `/panier`
  // (retour client 2026-07-23) — seules les fiches articles restent des
  // URLs de contenu.
  const boutiqueEntries: MetadataRoute.Sitemap = boutiqueOnly.map(({ slug, publishedAt }) => ({
    url: `${base}/boutique/${slug}`,
    ...(publishedAt ? { lastModified: publishedAt } : {}),
  }));

  return [...staticEntries, ...bookEntries, ...boutiqueEntries];
}
