"use client";

import Link from "next/link";
import { FOCUS_RING_LIGHT } from "@/lib/ui";
import { useCart } from "./cart-context";

/**
 * Cellule « Panier » de `site-header.tsx` (îlot badge, plan §4 étape 6) — la
 * transition reprend exactement la recette des cellules nav voisines
 * (`CELL_TRANSITION` de `site-header.tsx`, redéfinie ici en petit plutôt que
 * ré-exportée : une constante, pas une dépendance inverse `cart →
 * site-header`) ; le focus vient de `FOCUS_RING_LIGHT` SEUL (`lib/ui.ts`) — la
 * cellule passe de paper à pop-yellow au survol, deux fonds CLAIRS, et l'ink de
 * l'anneau y tient les deux états (17,19:1 puis 15,19:1) : aucune surcharge
 * `hover:focus-visible:` n'est nécessaire ici, contrairement aux cellules
 * voisines qui virent à l'ink (R5). Toujours rendue sous `<CartProvider>`.
 *
 * Rendu unique : pictogramme panier (carré Accueil/Panier du header desktop,
 * et rangée mobile) — SVG inline aux angles droits (R8) ; le compteur est
 * une pastille superposée pour ne pas élargir le carré ; nom accessible via
 * l'`aria-label`.
 */
const CELL_TRANSITION =
  "transition-all duration-200 ease-out motion-reduce:transition-none active:brightness-90";

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

/**
 * Pastille « n articles » superposée au coin haut-droit d'une cellule carrée du
 * header. Exportée parce que la MÊME case du quadrillage mobile porte tantôt le
 * pictogramme panier (menu déroulé), tantôt la flèche du menu déroulant (menu
 * fermé) : le compteur doit s'afficher dans les deux états (cf. `site-header`).
 * Rend `null` quand le panier est vide.
 */
export function CartCountBadge() {
  const { count } = useCart();
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute right-1 top-1 font-sans text-[10px] font-extrabold leading-none"
    >
      {count}
    </span>
  );
}

export function CartNavCell({
  placement,
}: {
  placement: string;
}) {
  const { count } = useCart();
  const ariaLabel =
    count > 0 ? `Panier, ${count} article${count > 1 ? "s" : ""}` : "Panier, vide";

  return (
    <Link
      href="/panier"
      aria-label={ariaLabel}
      className={`relative flex min-h-11 items-center justify-center bg-paper text-ink hover:bg-pop-yellow ${CELL_TRANSITION} ${FOCUS_RING_LIGHT} ${placement}`}
    >
      <CartGlyph />
      <CartCountBadge />
    </Link>
  );
}
