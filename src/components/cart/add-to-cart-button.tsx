"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/button";
import { FOCUS_RING_DARK, FOCUS_RING_HOVER_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";
import { useCart } from "./cart-context";

/**
 * Bouton « Ajouter au panier » — rendu par `buy-links.tsx` (fiche, pleine
 * taille, `variant="button"`) et `book-card.tsx` (vignette grille, petit chip
 * dans la rangée basse fixe, hors du cadre couverture, `variant="chip"`)
 * quand `canAddToCart(book)` (`cart-core.ts`). Les deux appelants ne le
 * rendent qu'à `book.purchaseMode === "cart"` — donc toujours sous
 * `<CartProvider>` (monté par `layout.tsx`).
 */
/**
 * Les deux états de la puce de grille, en classes LITTÉRALES (contrat JIT) et
 * à géométrie IDENTIQUE : elle vit dans la rangée basse à hauteur fixe de
 * `book-card`, un changement de boîte y ferait sauter la grille. Le retour est
 * donc porté par la seule couleur — l'inversion `ink↔paper` de R4/R7, en aplat
 * dur (R8), la même que celle du survol.
 *
 * Chaque état porte SON anneau (R5) : la puce au repos part d'un fond jaune et
 * vire à l'ink au survol — anneau clair + surcharge de survol sombre ; la puce
 * « ajoutée » est déjà en ink et ne bouge plus — anneau sombre seul. Un anneau
 * unique serait invisible dans l'un des deux (ink sur ink, 1:1).
 */
const CHIP_BASE =
  "flex h-11 w-11 flex-none items-center justify-center border-2 border-ink font-sans text-lg font-black leading-none transition-colors motion-reduce:transition-none";
const CHIP_IDLE = `${CHIP_BASE} bg-pop-yellow text-black hover:bg-ink hover:text-pop-yellow ${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK}`;
const CHIP_ADDED = `${CHIP_BASE} bg-ink text-pop-yellow ${FOCUS_RING_DARK}`;

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
  const resetTimeout = useRef<number | null>(null);

  // Le retour dure 1,5 s : sans nettoyage, quitter la page entre-temps
  // (navigation depuis une vignette de grille — le cas courant) laisserait un
  // `setState` tomber sur un composant démonté.
  useEffect(
    () => () => {
      if (resetTimeout.current != null) window.clearTimeout(resetTimeout.current);
    },
    [],
  );

  // `Button` peut rendre un `<a>` ou un `<button>` selon `href` — ici toujours
  // un `<button>` (aucun `href` transmis), mais son type d'`onClick` accepte
  // les deux pour rester générique.
  function handleClick(e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) {
    // Défensif : ce bouton n'est plus jamais nesté dans un `<Link>` (chip
    // sortie du lien en `book-card.tsx`, `nested-interactive`) — garde tout
    // de même `preventDefault`/`stopPropagation` au cas où un appelant futur
    // le placerait à nouveau dans un ancêtre cliquable.
    e.preventDefault();
    e.stopPropagation();
    addToCart(id, 1);
    // Retour visible pour les DEUX variantes (#82c) : la région live du
    // provider ne sert que les technologies d'assistance (`sr-only`), elle ne
    // dit rien à l'œil. La puce de grille restait donc sans aucun retour.
    setJustAdded(true);
    if (resetTimeout.current != null) window.clearTimeout(resetTimeout.current);
    resetTimeout.current = window.setTimeout(() => setJustAdded(false), 1500);
  }

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={handleClick}
        // `aria-label` STABLE malgré la bascule visuelle : il remplace déjà le
        // contenu du bouton pour les technologies d'assistance (le glyphe
        // n'est donc jamais lu), et le faire changer sous un bouton qui a le
        // focus provoquerait une seconde annonce en plus de celle de la
        // région live du provider.
        aria-label="Ajouter au panier"
        className={`${justAdded ? CHIP_ADDED : CHIP_IDLE} ${className ?? ""}`}
      >
        {justAdded ? "✓" : "+"}
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
