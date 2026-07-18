"use client";

import { useState, type MouseEvent } from "react";
import { FOCUS_RING } from "@/lib/ui";
import { useCart } from "./cart-context";

/**
 * Bouton « Ajouter au panier » — rendu par `buy-links.tsx` (fiche, pleine
 * taille, `variant="button"`) et `book-card.tsx` (vignette grille, petit chip
 * superposé à la couverture, `variant="chip"`) quand `canAddToCart(book)`
 * (`cart-core.ts`). Les deux appelants ne le rendent qu'à
 * `book.purchaseMode === "cart"` — donc toujours sous `<CartProvider>`
 * (monté par `layout.tsx`).
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

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
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
        className={`absolute bottom-1.5 right-1.5 z-[1] flex h-8 w-8 items-center justify-center border-2 border-black bg-pop-yellow font-sans text-lg font-black leading-none text-black transition-colors motion-reduce:transition-none hover:bg-black hover:text-pop-yellow ${FOCUS_RING} ${className ?? ""}`}
      >
        +
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center border-2 border-black bg-black px-5 py-2.5 font-sans text-sm font-bold uppercase tracking-[.03em] text-white transition-colors motion-reduce:transition-none hover:bg-pop-yellow hover:text-black ${FOCUS_RING} ${className ?? ""}`}
    >
      {justAdded ? "Ajouté au panier" : "Ajouter au panier"}
    </button>
  );
}
