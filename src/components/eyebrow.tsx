import type { ReactNode } from "react";

/**
 * Étiquette de section (« eyebrow ») — la recette typo copiée jusqu'ici à
 * l'identique au-dessus des titres : majuscules espacées, petite, grisée.
 * Avec `dot` (classe `bg-pop-*` littérale, contrat JIT), la variante étiquette
 * de la souscription : carré pop + extrabold noir. Marges et placement via
 * `className` (contrat des primitives partagées — la recette ne bouge qu'ici).
 */

const PLAIN = "font-sans text-xs font-bold uppercase tracking-[.22em] text-ink/70";
const DOTTED =
  "flex items-center gap-2 font-sans text-xs font-extrabold uppercase tracking-[.22em] text-ink";

export function Eyebrow({
  dot,
  className,
  children,
}: {
  /** Classe de couleur du carré (`bg-pop-teal`…) — littérale, pour le JIT Tailwind. */
  dot?: string;
  className?: string;
  children: ReactNode;
}) {
  if (dot) {
    return (
      <p className={className ? `${DOTTED} ${className}` : DOTTED}>
        <span aria-hidden="true" className={`h-2.5 w-2.5 ${dot}`} />
        {children}
      </p>
    );
  }
  return <p className={className ? `${PLAIN} ${className}` : PLAIN}>{children}</p>;
}
