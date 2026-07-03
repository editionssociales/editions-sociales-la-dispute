import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * Grille encadrée — recette du hairline noir : fond noir 2px entre les
 * cellules blanches (`gap-[2px] bg-black p-[2px]`). Utilisée par la mosaïque
 * de thèmes, les grilles de fiches, la pagination, les listes de liens
 * groupés, etc. Les appelants passent `grid-cols-*` / `auto-rows-*` / `mt-*`
 * via `className` ; les cellules enfants gardent leur propre `bg-white`.
 */

type FramedGridOwnProps<E extends ElementType> = {
  as?: E;
  flow?: "grid" | "flex";
  className?: string;
  children: ReactNode;
};

export type FramedGridProps<E extends ElementType> = FramedGridOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof FramedGridOwnProps<E>>;

const GRID_BASE = "grid gap-[2px] bg-black p-[2px]";
const FLEX_BASE = "flex flex-wrap gap-[2px] bg-black p-[2px]";

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
