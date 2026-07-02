import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Kicker } from "@/components/kicker";
import { ACCENTS, ACCENT_BG } from "@/lib/accents";

export const metadata: Metadata = { title: "Panier" };

// Mini étagère décorative : dos de livres aux couleurs de la palette,
// version réduite du motif du héro de la souscription.
const SPINES: { h: number; w: string }[] = [
  { h: 44, w: "w-3" },
  { h: 62, w: "w-4" },
  { h: 38, w: "w-2.5" },
  { h: 70, w: "w-3.5" },
  { h: 50, w: "w-4" },
  { h: 76, w: "w-3" },
  { h: 56, w: "w-3.5" },
];

export default function PanierPage() {
  return (
    <Container className="py-20 text-center sm:py-28">
      {/* Étagère vide qui attend ses livres */}
      <div className="mx-auto w-fit" aria-hidden="true">
        <div className="flex items-end justify-center gap-1">
          {SPINES.map((s, i) => (
            <div
              key={i}
              className={`${s.w} rounded-t-sm ${ACCENT_BG[ACCENTS[i % 4]]} animate-[spine-rise_0.7s_ease-out_both]`}
              style={{ height: s.h, animationDelay: `${i * 70}ms` }}
            />
          ))}
        </div>
        <div className="-mx-3 h-1.5 rounded bg-ink/20" />
      </div>

      <Kicker accent="bottle" className="mt-10">
        Boutique
      </Kicker>
      <h1 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
        Votre panier
      </h1>
      <p className="mx-auto mt-4 max-w-md text-ink-soft">
        Le panier unifié et le paiement en ligne seront intégrés à
        l&apos;étape 2 du chantier, sur la base de WooCommerce/Stripe.
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        En attendant, l&apos;étagère est prête à accueillir vos livres.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/catalogue"
          className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition-all hover:-translate-y-0.5 hover:opacity-90 motion-reduce:transition-none"
        >
          Parcourir le catalogue
        </Link>
        <Link
          href="/souscription"
          className="inline-flex rounded-full px-6 py-3 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-paper-2 motion-reduce:transition-none"
        >
          Soutenir la maison
        </Link>
      </div>
    </Container>
  );
}
