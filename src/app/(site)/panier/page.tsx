import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHero } from "@/components/page-hero";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Panier" };

/** `/panier` — le panier natif (`CartView`, îlot client, plan §4 étape 6). */
export default function PanierPage() {
  return (
    <Container className="bg-paper py-12">
      <Breadcrumb trail={[{ label: "Accueil", href: "/" }, { label: "Panier" }]} />

      <PageHero eyebrow="Commande" title="Votre panier" className="max-w-2xl" />

      <div className="mt-6 sm:mt-7">
        <CartView />
      </div>
    </Container>
  );
}
