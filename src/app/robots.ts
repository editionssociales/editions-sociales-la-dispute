import type { MetadataRoute } from "next";

/**
 * Convention de fichier racine (`app/robots.ts`, hors des route groups) :
 * seul un fichier posé directement dans `app/` produit `/robots.txt` — un
 * route group comme `(site)` n'y change rien pour l'URL, mais la convention
 * de fichier spéciale ne se résout qu'à la racine littérale de `app/`.
 *
 * Gate d'indexation (E2 du plan) : tant que `SITE_INDEXABLE` n'est pas posée
 * à `1` (Vercel, prod, au jour du flip DNS), le site entier est désindexé —
 * la beta `*.vercel.app` ne doit jamais apparaître dans les résultats.
 */
export default function robots(): MetadataRoute.Robots {
  // Slash final normalisé : évite un double slash si la variable d'env est
  // un jour saisie avec un `/` final (cf. `sitemap.ts`, même normalisation).
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://editionssociales.fr"
  ).replace(/\/+$/, "");

  if (process.env.SITE_INDEXABLE !== "1") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    // /admin (back-office Payload) et /api (REST/GraphQL Payload) ne doivent
    // jamais être crawlables ni indexables, y compris une fois le site indexable.
    rules: { userAgent: "*", allow: "/", disallow: ["/panier", "/admin", "/api"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
