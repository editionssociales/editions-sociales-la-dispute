import type { ReactNode } from "react";

/**
 * Largeurs closes de la primitive (#80) : Tailwind v4 ordonne les utilitaires
 * d'une même famille PAR VALEUR D'ÉCHELLE dans la feuille générée, pas par
 * ordre dans l'attribut — un `max-w-2xl` concaténé après le `max-w-6xl` par
 * défaut du composant perdait donc silencieusement (constaté au
 * `getComputedStyle` : 1152px au lieu de 672px). La prop remplace la
 * concaténation par un choix fermé, jamais les deux à la fois pour une même
 * largeur.
 */
const WIDTH: Record<"page" | "prose", string> = {
  page: "max-w-6xl",
  prose: "max-w-2xl",
};

export function Container({
  children,
  className = "",
  id,
  width = "page",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  /** `"page"` (défaut, 6xl) ou `"prose"` (2xl) — jamais un `max-w-*` dans `className`. */
  width?: "page" | "prose";
}) {
  return (
    <div id={id} className={`mx-auto w-full ${WIDTH[width]} px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}
