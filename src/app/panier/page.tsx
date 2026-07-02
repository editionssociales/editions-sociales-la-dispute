import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { ACCENTS, ACCENT_BG } from "@/lib/accents";

export const metadata: Metadata = { title: "Panier" };

/** Focus visible partagé : anneau jaune pop, lisible sur fond noir comme blanc. */
const FOCUS_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-pop-yellow focus-visible:outline-offset-[-2px]";

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
    <Container className="bg-white py-12">
      <nav
        aria-label="Fil d'ariane"
        className="font-sans text-xs font-bold uppercase tracking-[.06em] text-black/60"
      >
        <Link
          href="/"
          className="transition-colors motion-reduce:transition-none hover:text-black"
        >
          Accueil
        </Link>
        <span aria-hidden="true" className="px-1.5">
          /
        </span>
        <span className="text-black">Panier</span>
      </nav>

      <div className="mt-3.5 max-w-2xl">
        <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
          Commande
        </p>
        <h1 className="mt-2 font-sans text-4xl font-black italic leading-[0.98] text-black sm:text-5xl">
          Votre panier
        </h1>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-[2px] bg-black p-[2px] sm:mt-7 sm:grid-cols-2">
        {/* Étagère vide qui attend ses livres */}
        <div className="flex flex-col items-center gap-7 bg-white px-6 py-16 text-center sm:col-span-2">
          <div className="w-fit" aria-hidden="true">
            <div className="flex items-end justify-center gap-1">
              {SPINES.map((s, i) => (
                <div
                  key={i}
                  className={`${s.w} ${ACCENT_BG[ACCENTS[i % 4]]} animate-[spine-rise_0.7s_ease-out_both]`}
                  style={{ height: s.h, animationDelay: `${i * 70}ms` }}
                />
              ))}
            </div>
            <div className="-mx-3 h-1.5 bg-black" />
          </div>

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
          className={`flex items-center justify-center bg-black px-6 py-6 text-center font-sans text-sm font-extrabold uppercase tracking-[.05em] text-white transition-colors motion-reduce:transition-none hover:bg-pop-yellow hover:text-black ${FOCUS_CLASS}`}
        >
          Parcourir le catalogue
        </Link>
        <Link
          href="/souscription"
          className={`flex items-center justify-center bg-white px-6 py-6 text-center font-sans text-sm font-extrabold uppercase tracking-[.05em] text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-white ${FOCUS_CLASS}`}
        >
          Soutenir la maison
        </Link>
      </div>
    </Container>
  );
}
