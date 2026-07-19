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
 */
const CELL_TRANSITION = "transition-all duration-200 ease-out motion-reduce:transition-none";

export function CartNavCell({ compact, placement }: { compact: boolean; placement: string }) {
  const { count } = useCart();
  const size = compact ? "py-3 text-[12px] lg:py-0" : "py-7 text-[14px] lg:py-0";
  const label = count > 0 ? `Panier (${count})` : "Panier";
  return (
    <Link
      href="/panier"
      aria-label={count > 0 ? `Panier, ${count} article${count > 1 ? "s" : ""}` : "Panier, vide"}
      className={`flex items-center justify-center bg-paper px-4 text-center font-sans font-extrabold uppercase tracking-[.08em] text-black hover:bg-pop-yellow ${CELL_TRANSITION} ${FOCUS_RING_LIGHT} ${size} ${placement}`}
    >
      {label}
    </Link>
  );
}
