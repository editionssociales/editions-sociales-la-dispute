import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CartProvider } from "@/components/cart/cart-context";
import { RouteFocus } from "@/components/route-focus";
import { getReglagesSite } from "@/lib/site-content";
import { brevoConfigured } from "@/lib/brevo";
import { sentryIngestOrigin } from "@/lib/sentry-ingest";
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
  const sentryOrigin = sentryIngestOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);

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
            soit traitée comme bloquante. Le script inline (issue #112)
            refetch la feuille (CORS `*` + cache) et réécrit
            `font-display:auto` → `swap` avant de l'injecter : on ne
            contrôle pas le kit Adobe, et un <link> synchrone re-bloquerait
            le rendu. Si le fetch échoue, repli #84 : promotion `media=all`.
            `<noscript>` couvre le cas sans JS.
            L'inject est différé à `window.load` : les 3 fichiers Effra
            partaient en VeryHigh et volaient la bande au LCP (couverture
            ~30 Ko High). `media=print` continue de précharger la CSS à
            Low ; seuls les woff VeryHigh attendent la fin du document. */}
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
        {/* Sentry ingest : le SDK part dans le chemin critique
            (`instrumentation-client.ts`). Preconnect seulement si le DSN
            est posé — sinon c'est du bruit (issue #111). */}
        {sentryOrigin && (
          <link rel="preconnect" href={sentryOrigin} crossOrigin="anonymous" />
        )}
        <link
          rel="stylesheet"
          href="https://use.typekit.net/fwz0kkx.css"
          media="print"
          id="adobe-fonts-css"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function go(){var l=document.getElementById('adobe-fonts-css');if(!l)return;fetch(l.href).then(function(r){return r.ok?r.text():Promise.reject();}).then(function(c){var s=document.createElement('style');s.textContent=c.replace(/font-display:\\s*auto/g,'font-display:swap');l.replaceWith(s);}).catch(function(){l.media='all';});}if(document.readyState==='complete')go();else window.addEventListener('load',go);})();",
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
          <RouteFocus />
          <SiteHeader />
          <main id="contenu" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
        </CartProvider>
        {/* `newsletterEnabled` : sans `BREVO_API_KEY`, le double opt-in n'a
            pas d'objet (c'est la liste Brevo elle-même) — le pied rend une
            invitation à écrire plutôt qu'un champ qui échouerait en silence.
            Lecture au prérendu pour les pages statiques : sur Vercel, une
            variable ajoutée n'atteint le runtime qu'au déploiement suivant,
            la réversibilité est donc intacte (cf. `contact/page.tsx`). */}
        <SiteFooter footer={footer} newsletterEnabled={brevoConfigured()} />
        {/* Vercel Web Analytics (plan/06-operations.md, étape 4) — un
            <script> first-party sans cookie, aucun nœud visible : seule
            modification de DOM de cette phase, iso-rendu visuel préservé. */}
        <Analytics />
      </body>
    </html>
  );
}
