import type { Metadata } from "next";
import { Container } from "@/components/container";
import { Breadcrumb } from "@/components/breadcrumb";
import { Eyebrow } from "@/components/eyebrow";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Panier" };

/** `/panier` — le panier natif (`CartView`, îlot client, plan §4 étape 6). */
export default function PanierPage() {
  return (
    <Container className="bg-paper py-12">
      <Breadcrumb trail={[{ label: "Accueil", href: "/" }, { label: "Panier" }]} />

      <div className="mt-3.5 max-w-2xl">
        <Eyebrow>
          Commande
        </Eyebrow>
        <h1 className="mt-2 font-sans text-4xl font-black italic leading-[0.98] text-ink sm:text-5xl">
          Votre panier
        </h1>
      </div>

      <div className="mt-6 sm:mt-7">
        <CartView />
      </div>
    </Container>
  );
}
