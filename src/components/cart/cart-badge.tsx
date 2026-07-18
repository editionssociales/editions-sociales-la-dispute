"use client";

import Link from "next/link";
import { useCart } from "./cart-context";

/**
 * Cellule « Panier » de `site-header.tsx` (îlot badge, plan §4 étape 6) — la
 * transition/le focus reprennent exactement la recette des cellules nav
 * voisines (`CELL_TRANSITION`/`FOCUS_DARK` de `site-header.tsx`, redéfinies
 * ici en petit plutôt que ré-exportées : deux constantes, pas une dépendance
 * inverse `cart → site-header`). Toujours rendue sous `<CartProvider>`.
 */
const CELL_TRANSITION = "transition-all duration-200 ease-out motion-reduce:transition-none";
const FOCUS_DARK =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black";

export function CartNavCell({ compact, placement }: { compact: boolean; placement: string }) {
  const { count } = useCart();
  const size = compact ? "py-3 text-[12px] lg:py-0" : "py-7 text-[14px] lg:py-0";
  const label = count > 0 ? `Panier (${count})` : "Panier";
  return (
    <Link
      href="/panier"
      aria-label={count > 0 ? `Panier, ${count} article${count > 1 ? "s" : ""}` : "Panier, vide"}
      className={`flex items-center justify-center bg-white px-4 text-center font-sans font-extrabold uppercase tracking-[.08em] text-black hover:bg-pop-yellow ${CELL_TRANSITION} ${FOCUS_DARK} ${size} ${placement}`}
    >
      {label}
    </Link>
  );
}
