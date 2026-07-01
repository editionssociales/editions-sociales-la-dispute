import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";

export const metadata: Metadata = { title: "Panier" };

export default function PanierPage() {
  return (
    <Container className="py-20 text-center">
      <h1 className="font-serif text-3xl font-semibold">Votre panier</h1>
      <p className="mx-auto mt-3 max-w-md text-ink-soft">
        Le panier unifié (livres du catalogue + articles de la boutique) et le
        paiement Stripe seront intégrés à l&apos;étape 2 du chantier. La logique
        WooCommerce existante sert de base.
      </p>
      <Link
        href="/catalogue"
        className="mt-6 inline-flex rounded-full bg-es px-5 py-2.5 text-sm font-semibold text-white hover:bg-es-dark"
      >
        Parcourir le catalogue
      </Link>
    </Container>
  );
}
