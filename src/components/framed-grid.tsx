import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * Grille encadrée — recette du hairline noir : fond noir 2px entre les
 * cellules blanches (`gap-[2px] bg-ink p-[2px]`). Utilisée par la mosaïque
 * de thèmes, les grilles de fiches, la pagination, les listes de liens
 * groupés, etc. Les appelants passent `grid-cols-*` / `auto-rows-*` / `mt-*`
 * via `className` ; les cellules enfants gardent leur propre `bg-paper`.
 *
 * Flux `flex` : `w-fit` PAR DÉFAUT (retour client 2026-08-20) — le fond noir
 * n'est que le mortier des filets, jamais un remplissage : sans lui, un
 * groupe de quelques puces (filtres actifs, pagination) laissait tout le
 * reste de la rangée en aplat ink, un pavé de contraste sans fonction. Le
 * cadre épouse donc ses cellules, et le vide alentour reste le fond de page.
 */

type FramedGridOwnProps<E extends ElementType> = {
  as?: E;
  flow?: "grid" | "flex";
  className?: string;
  children: ReactNode;
};

export type FramedGridProps<E extends ElementType> = FramedGridOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof FramedGridOwnProps<E>>;

const GRID_BASE = "grid gap-[2px] bg-ink p-[2px]";
const FLEX_BASE = "flex w-fit flex-wrap gap-[2px] bg-ink p-[2px]";

export function FramedGrid<E extends ElementType = "div">({
  as,
  flow = "grid",
  className,
  children,
  ...rest
}: FramedGridProps<E>) {
  const Component = as ?? "div";
  const base = flow === "grid" ? GRID_BASE : FLEX_BASE;

  return (
    <Component className={className ? `${base} ${className}` : base} {...rest}>
      {children}
    </Component>
  );
}
