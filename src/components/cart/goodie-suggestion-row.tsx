"use client";

import Link from "next/link";
import { BookCover } from "@/lib/cover";
import { formatPrice } from "@/lib/format";
import type { Cover } from "@/lib/types";
import { FOCUS_RING_DARK, FOCUS_RING_HOVER_LIGHT, FOCUS_RING_LIGHT } from "@/lib/ui";
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
 * Ligne fantôme d'un goodie suggéré (refonte 2026-08-20 — remplace la grille
 * de fin de page de l'ex-`GoodiesCheckout`) : structurellement calquée sur
 * `CartLineRow` (`cart-view.tsx`, colonne vignette 72px + colonne contenu)
 * mais visuellement marquée comme SUGGESTION plutôt que ligne réelle — bordure
 * pointillée 2px ink (seule exception du site à la bordure pleine, cf.
 * `src/components/CLAUDE.md`, Constitution graphique R1-R8) et fond paper-2.
 *
 * Pas de colonnes prix/total séparées comme une ligne réelle : le prix est
 * porté PAR le bouton d'ajout lui-même (« +15,00 € » + flèche), recette
 * « add-on » d'une réservation — l'option la plus souvent choisie s'ajoute en
 * un clic, sans étape de quantité ni confirmation séparée. Le bouton démarre
 * en ink/paper (fond sombre) comme le CTA « Commander » du même fichier, donc
 * le même couple d'anneaux de focus (`FOCUS_RING_DARK` + surcharge de survol
 * claire) — le survol inverse vers paper/ink.
 */
export function GoodieSuggestionRow({ goodie }: { goodie: GoodieSuggestion }) {
  const { addToCart } = useCart();
  const href = `/boutique/${goodie.slug}`;
  const priceLabel = formatPrice(goodie.price);

  return (
    <div className="grid grid-cols-[72px_1fr_auto] items-stretch border-2 border-dashed border-ink bg-paper-2">
      <div className="flex items-center justify-center p-2">
        <Link href={href} className="block w-14 shrink-0">
          <BookCover
            cover={goodie.cover}
            title={goodie.title}
            alt={goodie.title}
            fit="width"
            sizes="56px"
            fallbackClassName="p-1 text-[8px]"
          />
        </Link>
      </div>
      <div className="flex flex-col justify-center gap-1 p-3">
        <Link
          href={href}
          className={`font-sans text-sm font-bold text-ink hover:underline ${FOCUS_RING_LIGHT}`}
        >
          {goodie.title}
        </Link>
      </div>
      <button
        type="button"
        onClick={() => addToCart(goodie.id, 1)}
        aria-label={`Ajouter ${goodie.title} au panier${priceLabel ? ` — ${priceLabel}` : ""}`}
        className={`flex h-full min-h-11 items-center justify-center gap-2 border-l-2 border-dashed border-ink bg-ink px-5 font-sans text-sm font-extrabold uppercase tracking-[.03em] text-paper transition-colors motion-reduce:transition-none hover:bg-paper hover:text-ink ${FOCUS_RING_DARK} ${FOCUS_RING_HOVER_LIGHT}`}
      >
        <span aria-hidden="true">+{priceLabel ?? "—"}</span>
        <span aria-hidden="true" className="text-base leading-none">
          →
        </span>
      </button>
    </div>
  );
}
