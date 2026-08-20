import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/page-hero";
import { getBoutiqueBooks } from "@/lib/catalogue";
import { canAddToCart } from "@/lib/cart-core";
import { CartView } from "./cart-view";

// `noindex` de PAGE plutôt qu'un `disallow` dans robots.txt (#87) : un
// disallow interdit l'exploration, donc empêche aussi le moteur de LIRE la
// directive — une URL de panier déjà connue peut rester indexée sans contenu.
export const metadata: Metadata = {
  title: "Panier",
  robots: { index: false, follow: true },
};

export const revalidate = 3600; // fenêtre ISR des suggestions goodies (Payload/Postgres)

/**
 * `/panier` — le panier natif (`CartView`, îlot client, plan §4 étape 6) +
 * les goodies au checkout (retour client 2026-07-23, ligne fantôme
 * 2026-08-20) : l'ex-page « La boutique » est supprimée, ses quelques
 * articles vendables (souvent un seul actif) sont suggérés directement sous
 * la dernière ligne du panier (`CartView`, prop `goodies`) — plus de section
 * séparée en pied de page.
 */
export default async function PanierPage() {
  const goodies = (await getBoutiqueBooks())
    .filter((b) => canAddToCart(b) && b.price != null)
    .slice(0, 4)
    .map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      price: b.price,
      cover: b.cover,
    }));

  return (
    <Container className="bg-paper py-12">
      <PageHero title="Votre panier" className="max-w-2xl" />

      <div className="mt-6 sm:mt-7">
        <CartView goodies={goodies} />
      </div>
    </Container>
  );
}
