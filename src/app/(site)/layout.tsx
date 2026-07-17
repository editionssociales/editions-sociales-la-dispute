import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Inter, Spectral } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CartProvider } from "@/components/cart/cart-context";
import { isCommerceNative } from "@/lib/env";
import { getReglagesSite } from "@/lib/site-content";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * Metadata par défaut éditables (global `reglages-site`, spec « éditeur de
 * contenus ») : `generateMetadata` remplace l'export `metadata` statique —
 * mêmes valeurs tant que le global est vide (fallback dur,
 * `site-content-core.ts`), le suffixe des titres de pages (`template`)
 * suit le titre par défaut. Pas de `params` dans ce layout racine ; le hook
 * `afterChange` du global revalide le layout entier.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getReglagesSite();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://editionssociales.fr"),
    title: {
      default: seo.titre,
      template: `%s — ${seo.titre}`,
    },
    description: seo.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Lue ici (server, comme `NEXT_PUBLIC_SITE_URL` juste au-dessus) et
  // descendue en PROP jusqu'à `SiteHeader` — jamais via `useSearchParams` ni
  // aucune API dynamique côté client (piège documenté : ce composant est
  // monté par le layout racine, un `useSearchParams` y ferait basculer TOUT
  // le site en rendu dynamique). `<CartProvider>` n'est monté qu'à `1` :
  // à `0`, ni lui ni ses consommateurs n'existent dans l'arbre — règle d'or
  // du lot (iso-rendu strict tant que le flag est bas).
  const commerceNative = isCommerceNative();
  const header = <SiteHeader commerceNative={commerceNative} />;
  // Textes du pied de page (global `reglages-site`) : descendus en props —
  // `SiteFooter` reste un composant serveur de pure présentation.
  const { footer } = await getReglagesSite();

  return (
    <html
      lang="fr"
      className={`${inter.variable} ${spectral.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        {/* Effra via Adobe Fonts (kit Typekit) — React 19 hisse ce <link> dans <head>. */}
        <link rel="stylesheet" href="https://use.typekit.net/fwz0kkx.css" />
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-paper"
        >
          Aller au contenu
        </a>
        {commerceNative ? (
          <CartProvider>
            {header}
            <main id="contenu" className="flex-1">{children}</main>
          </CartProvider>
        ) : (
          <>
            {header}
            <main id="contenu" className="flex-1">{children}</main>
          </>
        )}
        <SiteFooter footer={footer} />
        {/* Vercel Web Analytics (plan/06-operations.md, étape 4) — un
            <script> first-party sans cookie, aucun nœud visible : seule
            modification de DOM de cette phase, iso-rendu visuel préservé. */}
        <Analytics />
      </body>
    </html>
  );
}
