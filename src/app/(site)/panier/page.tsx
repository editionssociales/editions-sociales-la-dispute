import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/page-hero";
import { GoodiesCheckout } from "@/components/cart/goodies-checkout";
import { getBoutiqueBooks } from "@/lib/catalogue";
import { canAddToCart } from "@/lib/cart-core";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Panier" };

export const revalidate = 3600; // fenêtre ISR des suggestions goodies (Payload/Postgres)

/**
 * `/panier` — le panier natif (`CartView`, îlot client, plan §4 étape 6) +
 * les goodies au checkout (retour client 2026-07-23) : l'ex-page
 * « La boutique » est supprimée, ses quelques articles vendables (souvent un
 * seul actif) sont suggérés ici, sous le panier.
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
        <CartView />
      </div>

      <GoodiesCheckout goodies={goodies} />
    </Container>
  );
}
