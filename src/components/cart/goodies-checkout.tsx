"use client";

import Link from "next/link";
import { BookCover } from "@/lib/cover";
import { formatPrice } from "@/lib/format";
import type { Cover } from "@/lib/types";
import { FramedGrid } from "@/components/framed-grid";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";
import { AddToCartButton } from "./add-to-cart-button";
import { useCart } from "./cart-context";

/** Ce que le panier a besoin de savoir d'un article boutique suggéré. */
export interface GoodieSuggestion {
  id: number;
  slug: string;
  title: string;
  price: number | null;
  cover: Cover | null;
}

/**
 * Goodies au checkout (retour client 2026-07-23) : la page « La boutique »
 * est supprimée — les quelques articles boutique vendables (souvent un seul
 * actif) s'affichent ici, au pied du panier. Les articles déjà au panier
 * sont masqués ; plus rien à proposer (ou panier pas encore relu depuis
 * `localStorage`) = pas de section du tout.
 */
export function GoodiesCheckout({ goodies }: { goodies: GoodieSuggestion[] }) {
  const { state, ready } = useCart();
  if (!ready) return null;
  const visible = goodies.filter((g) => !state.lines.some((l) => l.id === g.id));
  if (visible.length === 0) return null;

  return (
    <section aria-label="Goodies" className="mt-10 border-t-2 border-ink pt-8">
      <h2 className="mb-4 font-sans text-xl font-black italic uppercase tracking-[.01em] text-ink">
        Nos goodies
      </h2>
      <FramedGrid className="grid-cols-2 sm:grid-cols-4">
        {visible.map((g) => (
          <div key={g.id} className="flex flex-col gap-3 bg-paper p-3">
            <Link
              href={`/boutique/${g.slug}`}
              className={`group block ${FOCUS_RING_LIGHT_OUTER}`}
            >
              <span className="relative block w-full overflow-hidden border-2 border-ink bg-paper-2 transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none">
                <BookCover
                  cover={g.cover}
                  title={g.title}
                  alt={`Visuel de « ${g.title} »`}
                  fit="width"
                  sizes="200px"
                  className="block h-auto w-full"
                  fallbackClassName="p-3"
                />
              </span>
              <span className="mt-2 block font-sans text-sm font-bold leading-snug text-ink">
                {g.title}
              </span>
            </Link>
            <div className="mt-auto flex items-center justify-between gap-2">
              <span className="font-sans text-sm font-black text-ink">
                {formatPrice(g.price) ?? ""}
              </span>
              <AddToCartButton id={g.id} variant="chip" />
            </div>
          </div>
        ))}
      </FramedGrid>
    </section>
  );
}
