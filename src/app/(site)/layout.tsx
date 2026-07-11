import type { Metadata } from "next";
import { Inter, Spectral } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://editionssociales.fr"),
  title: {
    default: "Les Éditions sociales x La Dispute",
    template: "%s — Les Éditions sociales x La Dispute",
  },
  description:
    "Les Éditions sociales x La Dispute : essais critiques, sciences sociales, philosophie et histoire du mouvement ouvrier.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
        <SiteHeader />
        <main id="contenu" className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
