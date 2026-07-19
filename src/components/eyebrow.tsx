import type { ReactNode } from "react";

/**
 * Étiquette de section (« eyebrow ») — la recette typo copiée jusqu'ici à
 * l'identique au-dessus des titres : majuscules espacées, petite, grisée.
 * Échelle fermée à 2 variantes (R6) : `lg` (défaut, eyebrows de héros de page
 * et de section) et `sm` (labels de fiche produit, tracking resserré). Avec
 * `dot` (classe `bg-pop-*` littérale, contrat JIT), la variante étiquette de
 * la souscription : carré pop + extrabold noir, indépendante de `variant`.
 * Marges et placement via `className` (contrat des primitives partagées — la
 * recette ne bouge qu'ici).
 */

const LG = "font-sans text-xs font-extrabold uppercase tracking-[.22em] text-ink/70";
const SM = "font-sans text-xs font-bold uppercase tracking-[.06em] text-muted";
const DOTTED =
  "flex items-center gap-2 font-sans text-xs font-extrabold uppercase tracking-[.22em] text-ink";

export function Eyebrow({
  variant = "lg",
  dot,
  className,
  children,
}: {
  /** `lg` (défaut, héros) ou `sm` (labels de fiche) — ignoré si `dot` est fourni. */
  variant?: "lg" | "sm";
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
  const base = variant === "sm" ? SM : LG;
  return <p className={className ? `${base} ${className}` : base}>{children}</p>;
}
