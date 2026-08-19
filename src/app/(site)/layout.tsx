import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CartProvider } from "@/components/cart/cart-context";
import { getReglagesSite } from "@/lib/site-content";
import { FOCUS_RING_DARK } from "@/lib/ui";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Metadata par défaut éditables (global `pages-legales`, spec « éditeur de
 * contenus ») : `generateMetadata` remplace l'export `metadata` statique —
 * mêmes valeurs tant que le global est vide (fallback dur,
 * `site-content-core.ts`), le suffixe des titres de pages (`template`)
 * suit le titre par défaut. Pas de `params` dans ce layout racine ; le hook
 * `afterChange` du global revalide le layout entier.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getReglagesSite();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ld-es.fr"),
    title: {
      default: seo.titre,
      template: `%s — ${seo.titre}`,
    },
    description: seo.description,
    // Cartes de partage (réseaux sociaux, messageries) : défauts hérités par
    // toutes les pages — les fiches livre ajoutent leur couverture en
    // `og:image`. `og:title`/`og:description` suivent title/description de
    // chaque page (résolution Next), `og:url` suit le canonical.
    openGraph: {
      type: "website",
      siteName: seo.titre,
      locale: "fr_FR",
    },
    twitter: {
      card: "summary",
    },
  };
}

/**
 * JSON-LD `Organization` + `WebSite` persistant (issue #87d) : posé une fois
 * ici plutôt que dupliqué page par page — aide les crawlers (et
 * LLM-crawlers) à qualifier l'éditeur du site sur CHAQUE page, pas
 * seulement `/souscription` (qui garde son propre graphe `DonateAction`,
 * plus spécifique à la campagne). Constante FIGÉE construite en code,
 * jamais de contenu CMS : hors de la règle `SafeHtml` (`src/app/CLAUDE.md`),
 * qui vise le HTML éditorial injecté.
 */
function organizationJsonLd(siteName: string, siteUrl: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${siteUrl}/#organization`, name: siteName, url: siteUrl },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: siteName,
        url: siteUrl,
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  }).replace(/</g, "\\u003c");
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Textes du pied de page (global `pages-legales`) : descendus en props —
  // `SiteFooter` reste un composant serveur de pure présentation. `seo.titre`
  // alimente aussi le JSON-LD Organization/WebSite ci-dessous (même lecture,
  // pas d'appel réseau supplémentaire). `SiteHeader` confine `useSearchParams`
  // derrière `<Suspense>` (piège documenté : sans ça, le layout racine
  // dynamiserait tout le site).
  const { footer, seo } = await getReglagesSite();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ld-es.fr").replace(
    /\/+$/,
    "",
  );

  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: organizationJsonLd(seo.titre, siteUrl) }}
        />
        {/* Effra (Adobe Fonts) : preconnect + chargement ASYNCHRONE (issue
            #84) — React 19 hisse ces <link> dans <head>. La feuille Adobe
            bloquait le rendu (tierce origine, synchrone, devant Inter ET
            tous les titres) ; `media="print"` la télécharge sans qu'elle
            soit traitée comme bloquante, puis le script inline (exécution
            immédiate, aucune attente réseau) la promeut en `media="all"`
            (technique `loadCSS`, geste réversible — pas d'auto-hébergement,
            licence Adobe non vérifiée). `<noscript>` couvre le cas sans JS. */}
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://use.typekit.net/fwz0kkx.css"
          media="print"
          id="adobe-fonts-css"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: "document.getElementById('adobe-fonts-css').media='all';",
          }}
        />
        <noscript>
          <link rel="stylesheet" href="https://use.typekit.net/fwz0kkx.css" />
        </noscript>
        <a
          href="#contenu"
          className={`sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:bg-ink focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-paper ${FOCUS_RING_DARK}`}
        >
          Aller au contenu
        </a>
        <CartProvider>
          <SiteHeader />
          <main id="contenu" className="flex-1">
            {children}
          </main>
        </CartProvider>
        <SiteFooter footer={footer} />
        {/* Vercel Web Analytics (plan/06-operations.md, étape 4) — un
            <script> first-party sans cookie, aucun nœud visible : seule
            modification de DOM de cette phase, iso-rendu visuel préservé. */}
        <Analytics />
      </body>
    </html>
  );
}
