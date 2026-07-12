import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBoutiqueBooks } from "@/lib/catalogue";
import { isCommerceNative } from "@/lib/env";
import { BookGrid } from "@/components/book-grid";
import { Container } from "@/components/container";
import { Breadcrumb } from "@/components/breadcrumb";

/**
 * Destination publique des produits boutique-seuls (plan §4 étape 7). À
 * `COMMERCE_NATIVE=0` (défaut, règle d'or du lot) : redirection identique à
 * l'existant — la boutique reste fusionnée dans le catalogue unique, rien ne
 * change tant que le flag n'est pas explicitement à `1`. À `1` : grille des
 * ~15-20 articles `origin: "boutique"` (goodies, manuels, correspondances…),
 * même grammaire brutaliste que `/catalogue` — pas de filtres/pagination,
 * la liste reste courte (« pas de sur-design », plan §4 étape 7).
 *
 * Volontairement absente de `src/app/sitemap.ts` : elle suivra le flip du
 * flag (plan §4 étape 7, note explicite).
 */

export const metadata: Metadata = {
  title: "Boutique",
  description: "Goodies, manuels et articles hors catalogue des Éditions sociales x La Dispute.",
  alternates: { canonical: "/boutique" },
};

export const revalidate = 3600;

export default async function BoutiquePage() {
  if (!isCommerceNative()) redirect("/catalogue");

  const books = await getBoutiqueBooks();

  return (
    <Container className="bg-white py-12">
      <Breadcrumb trail={[{ label: "Accueil", href: "/" }, { label: "Boutique" }]} />

      <div className="mt-3.5 max-w-2xl">
        <h1 className="font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
          La boutique
        </h1>
      </div>

      <div className="mt-6 flex items-baseline justify-between gap-4 border-t-2 border-black pt-[18px]">
        <span className="font-sans text-[13px] font-bold uppercase tracking-[.03em] text-black">
          {books.length} {books.length > 1 ? "articles" : "article"}
        </span>
      </div>

      <div className="mt-4">
        <BookGrid books={books} />
      </div>
    </Container>
  );
}
