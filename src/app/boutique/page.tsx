import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/container";
import { getProducts, countProducts } from "@/lib/boutique";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Boutique",
  description:
    "La librairie en ligne commune aux Éditions sociales et à La Dispute.",
};

export const dynamic = "force-dynamic";

export default async function BoutiquePage() {
  const [products, total] = await Promise.all([getProducts(60), countProducts()]);

  return (
    <Container className="py-12">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-es">
          Librairie
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold">La boutique</h1>
        <p className="mt-3 text-ink-soft">
          {total} produits disponibles. Le panier et le paiement (Stripe, déjà
          configuré côté boutique) seront réintégrés dans une prochaine étape ;
          en attendant, chaque article renvoie vers la boutique en ligne.
        </p>
      </header>

      <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <article key={p.id} className="flex flex-col">
            <Link
              href={p.permalink}
              target="_blank"
              rel="noreferrer"
              className="relative block aspect-square overflow-hidden rounded-sm bg-paper-2 ring-1 ring-line"
            >
              {p.imageUrl ? (
                <Image
                  src={p.imageUrl}
                  alt={p.title}
                  fill
                  sizes="(max-width: 640px) 45vw, 220px"
                  className="object-contain p-3"
                />
              ) : (
                <span className="flex h-full items-center justify-center p-3 text-center text-xs text-muted">
                  {p.title}
                </span>
              )}
            </Link>
            <h3 className="mt-3 text-sm font-medium leading-snug">
              <Link href={p.permalink} target="_blank" rel="noreferrer" className="hover:text-es">
                {p.title}
              </Link>
            </h3>
            {p.price != null && (
              <p className="mt-1 text-sm font-semibold text-ink">
                {formatPrice(p.price)}
              </p>
            )}
          </article>
        ))}
      </div>
    </Container>
  );
}
