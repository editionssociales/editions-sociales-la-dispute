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
 * Deux rendus :
 *  - texte « Panier (n) » (desktop) — taille fixe sous `lg`, écart
 *    compact/déployé au scroll à partir de `lg` (chantier 3 §3) ;
 *  - `icon` : pictogramme panier + compteur (rangée mobile du header, jamais
 *    affichée à `lg`) — SVG inline aux angles droits (R8), nom accessible
 *    inchangé via l'`aria-label`.
 */
const CELL_TRANSITION = "transition-all duration-200 ease-out motion-reduce:transition-none";

function CartGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M2.5 4.5h3.2L8 14.5h10.4l2.1-7.5H6.4" />
      <rect x="8" y="17.5" width="3.4" height="3.4" fill="currentColor" stroke="none" />
      <rect x="14.6" y="17.5" width="3.4" height="3.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CartNavCell({
  compact,
  placement,
  icon = false,
}: {
  compact: boolean;
  placement: string;
  /** Rendu pictogramme + compteur (rangée mobile) au lieu du libellé texte. */
  icon?: boolean;
}) {
  const { count } = useCart();
  const ariaLabel =
    count > 0 ? `Panier, ${count} article${count > 1 ? "s" : ""}` : "Panier, vide";

  if (icon) {
    return (
      <Link
        href="/panier"
        aria-label={ariaLabel}
        className={`flex min-h-11 items-center justify-center gap-1 bg-paper px-2 text-black hover:bg-pop-yellow ${CELL_TRANSITION} ${FOCUS_RING_LIGHT} ${placement}`}
      >
        <CartGlyph />
        {count > 0 && (
          <span aria-hidden="true" className="font-sans text-[12px] font-extrabold leading-none">
            {count}
          </span>
        )}
      </Link>
    );
  }

  const lg = compact ? "lg:min-h-0 lg:py-0 lg:text-[12px]" : "lg:min-h-0 lg:py-0 lg:text-[14px]";
  const label = count > 0 ? `Panier (${count})` : "Panier";
  return (
    <Link
      href="/panier"
      aria-label={ariaLabel}
      className={`flex min-h-11 items-center justify-center bg-paper px-4 py-4 text-center font-sans text-[13px] font-extrabold uppercase tracking-[.08em] text-black hover:bg-pop-yellow ${CELL_TRANSITION} ${FOCUS_RING_LIGHT} ${lg} ${placement}`}
    >
      {label}
    </Link>
  );
}
