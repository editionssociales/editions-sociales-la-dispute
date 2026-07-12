import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Breadcrumb } from "@/components/breadcrumb";
import { FramedGrid } from "@/components/framed-grid";
import { Eyebrow } from "@/components/eyebrow";
import { ShelfSpines } from "@/components/cart/shelf-spines";
import { FOCUS_RING } from "@/lib/ui";
import { isCommerceNative } from "@/lib/env";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Panier" };

/**
 * `/panier` — placeholder historique à `COMMERCE_NATIVE=0` (STRICTEMENT
 * inchangé, règle d'or du lot : ne touche à rien ici sous ce flag), panier
 * réel (`CartView`, îlot client) à `1` (plan §4 étape 6). Seul le décor
 * (`ShelfSpines`) est partagé entre les deux — extrait de ce fichier sans
 * changer son rendu.
 */
export default function PanierPage() {
  const native = isCommerceNative();

  return (
    <Container className="bg-white py-12">
      <Breadcrumb trail={[{ label: "Accueil", href: "/" }, { label: "Panier" }]} />

      <div className="mt-3.5 max-w-2xl">
        <Eyebrow>
          Commande
        </Eyebrow>
        <h1 className="mt-2 font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
          Votre panier
        </h1>
      </div>

      {native ? (
        <div className="mt-6 sm:mt-7">
          <CartView />
        </div>
      ) : (
        <FramedGrid className="mt-6 grid-cols-1 sm:mt-7 sm:grid-cols-2">
          {/* Étagère vide qui attend ses livres */}
          <div className="flex flex-col items-center gap-7 bg-white px-6 py-16 text-center sm:col-span-2">
            <ShelfSpines />

            <div className="max-w-md">
              <p className="font-sans text-[15px] leading-relaxed text-black/70">
                Le panier unifié et le paiement en ligne seront intégrés à
                l&apos;étape 2 du chantier, sur la base de WooCommerce/Stripe.
              </p>
              <p className="mt-2 font-sans text-sm font-bold uppercase tracking-[.03em] text-black/50">
                En attendant, l&apos;étagère est prête à accueillir vos livres.
              </p>
            </div>
          </div>

          <Link
            href="/catalogue"
            className={`flex items-center justify-center bg-black px-6 py-6 text-center font-sans text-sm font-extrabold uppercase tracking-[.05em] text-white transition-colors motion-reduce:transition-none hover:bg-pop-yellow hover:text-black ${FOCUS_RING}`}
          >
            Parcourir le catalogue
          </Link>
          <Link
            href="/souscription"
            className={`flex items-center justify-center bg-white px-6 py-6 text-center font-sans text-sm font-extrabold uppercase tracking-[.05em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white ${FOCUS_RING}`}
          >
            Soutenir la maison
          </Link>
        </FramedGrid>
      )}
    </Container>
  );
}
