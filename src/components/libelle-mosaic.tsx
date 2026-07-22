import type { CSSProperties } from "react";
import Link from "next/link";
import { FramedGrid } from "./framed-grid";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Mosaïque pondérée des libellés du catalogue — LA vue « GEME » retenue par
 * le client (20/07) pour toutes les vues catalogue, sur le quadrillage
 * brutaliste noir 2px, cellule active inversée noir/blanc. Extraite de
 * /catalogue/[edition] pour vivre UNE fois — consommée par /catalogue ET
 * /catalogue/[edition] ; l'ordre des items vient de `getFacets`
 * (alphabétique — arbitrage client 22/07 : mosaïque « désordonnée » assumée,
 * pas de tri par taille), la grille dense comble ce qu'elle peut, les trous
 * restants sont acceptés.
 *
 * Loi de taille (client, 22/07 au soir) : l'AIRE d'une cellule, en unités de
 * grille (minimum 1), est `round(√(nb de titres))`, posée telle quelle comme
 * un produit colonnes × lignes aux facteurs les plus proches possibles — la
 * paire de diviseurs la plus « carrée », le plus grand facteur à
 * l'horizontale. Une aire PREMIÈRE n'a que 1×p : bande d'une seule ligne.
 * Ex. : 9 titres → aire 3 → 3×1 ; 14 → aire 4 → 2×2 ; 38 → aire 6 → 3×2 ;
 * 93 → aire 10 → 5×2 ; 295 → aire 17 (premier) → bande 17×1.
 *
 * Grille : le JIT ne compilant pas de classes dynamiques, les spans passent
 * par des maps littérales (bornées à 20 colonnes / 6 lignes) et le nombre de
 * colonnes lg — la plus grande largeur requise par les items — s'injecte via
 * la variable CSS `--mosaic-cols` (valeur inline, classe littérale). En
 * mobile : une colonne, chaque libellé est une bande pleine largeur.
 */

/** Aire d'une cellule en unités de grille : arrondi de √(nb de titres). */
function cellArea(count: number) {
  return Math.max(1, Math.round(Math.sqrt(Math.max(0, count))));
}

/**
 * Factorisation la plus « carrée » : [lignes, colonnes], lignes = plus grand
 * diviseur ≤ √n. Un nombre premier ne laisse que [1, p] — la « ligne simple ».
 */
function closestFactors(n: number): [number, number] {
  for (let rows = Math.floor(Math.sqrt(n)); rows >= 2; rows--) {
    if (n % rows === 0) return [rows, n / rows];
  }
  return [1, n];
}

/** Spans littéraux (le JIT ne compile pas `col-span-${n}`). */
const COL_SPAN: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  10: "lg:col-span-10",
  11: "lg:col-span-11",
  12: "lg:col-span-12",
  13: "lg:col-span-[13]",
  14: "lg:col-span-[14]",
  15: "lg:col-span-[15]",
  16: "lg:col-span-[16]",
  17: "lg:col-span-[17]",
  18: "lg:col-span-[18]",
  19: "lg:col-span-[19]",
  20: "lg:col-span-[20]",
};
const MAX_COLS = 20;
const ROW_SPAN: Record<number, string> = {
  1: "lg:row-span-1",
  2: "lg:row-span-2",
  3: "lg:row-span-3",
  4: "lg:row-span-4",
  5: "lg:row-span-5",
  6: "lg:row-span-6",
};
const MAX_ROWS = 6;

function spanFor(count: number) {
  const [rawRows, rawCols] = closestFactors(cellArea(count));
  const cols = Math.min(rawCols, MAX_COLS);
  const rows = Math.min(rawRows, MAX_ROWS);
  return {
    cols,
    className: `${COL_SPAN[cols]} ${ROW_SPAN[rows]}`,
    // Bandes d'une ligne : libellé et compte tiennent côte à côte ; blocs
    // multi-lignes : pile classique avec un corps un cran plus grand.
    textClass:
      rows >= 2
        ? "text-[clamp(13px,1.4vw,18px)]"
        : "text-[clamp(11px,1.1vw,14px)]",
  };
}

export interface LibelleMosaicItem {
  name: string;
  /** `null` = cellule « Tous les livres » (aucun libellé actif). */
  slug: string | null;
  count: number;
}

/** Cellule de la mosaïque — inversion noir/blanc à l'état actif. */
function ThemeCell({
  href,
  active,
  span,
  textClass,
  label,
  count,
}: {
  href: string;
  active: boolean;
  span: string;
  textClass: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col justify-end gap-1 overflow-hidden px-[13px] py-[9px] transition-colors motion-reduce:transition-none focus-visible:z-[2] ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${span} ${invertingCell(active)}`}
    >
      <span className={`font-sans font-black uppercase leading-[1.02] tracking-[.01em] ${textClass}`}>
        {label}
      </span>
      <span className="font-sans text-[10px] font-bold uppercase tracking-[.05em] opacity-60">
        {count} titres
      </span>
    </Link>
  );
}

export function LibelleMosaic({
  items,
  activeLibelle,
  hrefFor,
  ariaLabel,
  className = "",
}: {
  items: LibelleMosaicItem[];
  /** Slug du libellé actif (`undefined` = « Tous les livres »). */
  activeLibelle?: string;
  /** Construit l'URL d'une cellule (`null` = retour à « Tous les livres »). */
  hrefFor: (slug: string | null) => string;
  ariaLabel: string;
  className?: string;
}) {
  const spans = items.map((item) => spanFor(item.count));
  const gridCols = Math.max(...spans.map((s) => s.cols), 1);
  return (
    <FramedGrid
      as="nav"
      aria-label={ariaLabel}
      style={{ "--mosaic-cols": String(gridCols) } as CSSProperties}
      className={`grid-flow-row-dense auto-rows-[clamp(44px,4.5vw,60px)] grid-cols-1 lg:grid-cols-[repeat(var(--mosaic-cols),minmax(0,1fr))] ${className}`}
    >
      {items.map((item, i) => {
        const span = spans[i];
        const active = (item.slug ?? undefined) === activeLibelle;
        return (
          <ThemeCell
            key={item.slug ?? "all"}
            href={hrefFor(item.slug)}
            active={active}
            span={span.className}
            textClass={span.textClass}
            label={item.name}
            count={item.count}
          />
        );
      })}
    </FramedGrid>
  );
}
