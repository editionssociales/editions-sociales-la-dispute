"use client";

import Link from "next/link";
import { FOCUS_RING_LIGHT } from "@/lib/ui";
import { useCart } from "./cart-context";

/**
 * Cellule « Panier » de `site-header.tsx` (îlot badge, plan §4 étape 6) — la
 * transition reprend exactement la recette des cellules nav voisines
 * (`CELL_TRANSITION` de `site-header.tsx`, redéfinie ici en petit plutôt que
 * ré-exportée : une constante, pas une dépendance inverse `cart →
 * site-header`) ; le focus vient de `FOCUS_RING_LIGHT` (`lib/ui.ts`, fond
 * paper au repos, R5). Toujours rendue sous `<CartProvider>`.
 *
 * Taille FIXE sous `lg` (compact par défaut, cf. `site-header.tsx` — chantier
 * 3 §3) ; à `lg` et au-delà, la hauteur suit la rangée (py-0) et la taille de
 * texte reprend l'écart compact/déployé au scroll.
 */
const CELL_TRANSITION = "transition-all duration-200 ease-out motion-reduce:transition-none";

export function CartNavCell({ compact, placement }: { compact: boolean; placement: string }) {
  const { count } = useCart();
  const lg = compact ? "lg:min-h-0 lg:py-0 lg:text-[12px]" : "lg:min-h-0 lg:py-0 lg:text-[14px]";
  const label = count > 0 ? `Panier (${count})` : "Panier";
  return (
    <Link
      href="/panier"
      aria-label={count > 0 ? `Panier, ${count} article${count > 1 ? "s" : ""}` : "Panier, vide"}
      className={`flex min-h-11 items-center justify-center bg-paper px-4 py-4 text-center font-sans text-[13px] font-extrabold uppercase tracking-[.08em] text-black hover:bg-pop-yellow ${CELL_TRANSITION} ${FOCUS_RING_LIGHT} ${lg} ${placement}`}
    >
      {label}
    </Link>
  );
}
