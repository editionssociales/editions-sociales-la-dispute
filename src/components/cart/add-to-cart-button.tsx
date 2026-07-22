"use client";

import { useState, type MouseEvent } from "react";
import { Button } from "@/components/button";
import { FOCUS_RING_LIGHT } from "@/lib/ui";
import { useCart } from "./cart-context";

/**
 * Bouton « Ajouter au panier » — rendu par `buy-links.tsx` (fiche, pleine
 * taille, `variant="button"`) et `book-card.tsx` (vignette grille, petit chip
 * dans la rangée basse fixe, hors du cadre couverture, `variant="chip"`)
 * quand `canAddToCart(book)` (`cart-core.ts`). Les deux appelants ne le
 * rendent qu'à `book.purchaseMode === "cart"` — donc toujours sous
 * `<CartProvider>` (monté par `layout.tsx`).
 */
export function AddToCartButton({
  id,
  variant = "button",
  className,
}: {
  id: number;
  variant?: "button" | "chip";
  className?: string;
}) {
  const { addToCart } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  // `Button` peut rendre un `<a>` ou un `<button>` selon `href` — ici toujours
  // un `<button>` (aucun `href` transmis), mais son type d'`onClick` accepte
  // les deux pour rester générique.
  function handleClick(e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) {
    // `book-card.tsx` enveloppe la couverture (et ce bouton) dans un `<Link>`
    // vers la fiche — ne jamais laisser le clic naviguer en plus d'ajouter.
    e.preventDefault();
    e.stopPropagation();
    addToCart(id, 1);
    if (variant === "button") {
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1500);
    }
  }

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label="Ajouter au panier"
        className={`flex h-8 w-8 flex-none items-center justify-center border-2 border-ink bg-pop-yellow font-sans text-lg font-black leading-none text-black transition-colors motion-reduce:transition-none hover:bg-ink hover:text-pop-yellow ${FOCUS_RING_LIGHT} ${className ?? ""}`}
      >
        +
      </button>
    );
  }

  return (
    <Button
      onClick={handleClick}
      className={`px-5 py-2.5 text-sm tracking-[.03em] ${className ?? ""}`}
    >
      {justAdded ? "Ajouté au panier" : "Ajouter au panier"}
    </Button>
  );
}
