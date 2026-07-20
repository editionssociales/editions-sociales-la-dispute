import type { Metadata } from "next";
import { getBoutiqueBooks } from "@/lib/catalogue";
import { BookGrid } from "@/components/book-grid";
import { Container } from "@/components/container";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHero } from "@/components/page-hero";

/**
 * Destination publique des produits boutique-seuls (plan §4 étape 7) :
 * grille des ~15-20 articles `origin: "boutique"` (goodies, manuels,
 * correspondances…), même grammaire brutaliste que `/catalogue` — pas de
 * filtres/pagination, la liste reste courte (« pas de sur-design »).
 */

export const metadata: Metadata = {
  title: "Boutique",
  description: "Goodies, manuels et articles hors catalogue des Éditions sociales x La Dispute.",
  alternates: { canonical: "/boutique" },
};

export const revalidate = 3600;

export default async function BoutiquePage() {
  const books = await getBoutiqueBooks();

  return (
    <Container className="bg-paper py-12 sm:py-16">
      <Breadcrumb trail={[{ label: "Accueil", href: "/" }, { label: "Boutique" }]} />

      <PageHero title="La boutique" className="max-w-2xl" />

      {books.length > 0 && (
        <div className="mt-6 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-[18px]">
          <span className="font-sans text-[13px] font-bold uppercase tracking-[.03em] text-ink">
            {books.length} {books.length > 1 ? "articles" : "article"}
          </span>
        </div>
      )}

      <div className="mt-4">
        <BookGrid
          books={books}
          emptyTitle="La boutique ouvre bientôt."
          emptyHint="Les premiers articles arrivent — en attendant, tout le catalogue des deux maisons est à parcourir."
        />
      </div>
    </Container>
  );
}
