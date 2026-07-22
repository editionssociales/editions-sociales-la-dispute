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
 * Loi de taille (client, 22/07 au soir, amendée 23/07) : l'AIRE d'une
 * cellule, en unités de grille (minimum 1), est `round(√(nb de titres))`,
 * posée comme un produit colonnes × lignes aux facteurs les plus proches
 * possibles — la paire de diviseurs la plus « carrée », le plus grand
 * facteur à l'horizontale. Une aire PREMIÈRE ≥ 5 reçoit **+1** (elle devient
 * paire, donc factorisable en bloc — trop de bandes sinon) ; seules les
 * aires 2 et 3 restent en bande d'une seule ligne.
 * Ex. : 9 titres → aire 3 → bande 3×1 ; 14 → aire 4 → 2×2 ; 38 → aire 6 →
 * 3×2 ; 54 → aire 7→8 → 4×2 ; 93 → aire 10 → 5×2 ; 295 → aire 17→18 → 6×3.
 *
 * Grille : taille CHOISIE D'AVANCE — 10 colonnes en lg (unité ≈ 110 px dans
 * le conteneur max-w-6xl : les petites cellules restent lisibles), plutôt
 * qu'une grille dérivée du plus gros item qui écrasait l'unité. Les largeurs
 * qui débordent sont plafonnées à la pleine largeur (aujourd'hui : seule
 * « Tous les livres », aire 17, première → bande pleine largeur). Spans en
 * maps littérales (JIT). RESPONSIVE (client 23/07 : « garder une forme
 * similaire même sur mobile ») : sous lg la grille passe à 5 colonnes — la
 * moitié — et chaque bloc garde ses proportions avec une largeur divisée par
 * deux (ceil, minimum 2 colonnes pour la lisibilité des libellés) ; les
 * bandes d'une ligne passent pleine largeur ; les hauteurs de rangées sont
 * identiques aux deux tailles.
 */

function isPrime(n: number) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}

/**
 * Aire d'une cellule en unités de grille : arrondi de √(nb de titres) —
 * +1 sur les aires premières ≥ 5 pour les rendre factorisables en bloc
 * (amendement client 23/07 : trop de bandes d'une ligne sinon).
 */
function cellArea(count: number) {
  const area = Math.max(1, Math.round(Math.sqrt(Math.max(0, count))));
  return area >= 5 && isPrime(area) ? area + 1 : area;
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
const LG_COL_SPAN: Record<number, string> = {
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
};
/** Largeur de la grille lg, fixée d'avance (cf. docstring). */
const MAX_COLS = 10;
/** Spans mobile (grille 5 colonnes sous lg). */
const BASE_COL_SPAN: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
};
const BASE_MAX_COLS = 5;
/** Hauteurs identiques à toutes les tailles — pas de variante lg. */
const ROW_SPAN: Record<number, string> = {
  1: "row-span-1",
  2: "row-span-2",
  3: "row-span-3",
  4: "row-span-4",
  5: "row-span-5",
  6: "row-span-6",
};
const MAX_ROWS = 6;

function spanFor(count: number) {
  const [rawRows, rawCols] = closestFactors(cellArea(count));
  const cols = Math.min(rawCols, MAX_COLS);
  const rows = Math.min(rawRows, MAX_ROWS);
  // Mobile : bandes d'une ligne pleine largeur ; blocs à largeur divisée par
  // deux (ceil), plancher 2 colonnes — sous 2 unités (~150px), les libellés
  // longs ne tiennent plus même césurés.
  const baseCols =
    rows === 1
      ? BASE_MAX_COLS
      : Math.min(Math.max(Math.ceil(cols / 2), 2), BASE_MAX_COLS);
  return {
    cols,
    className: `${BASE_COL_SPAN[baseCols]} ${LG_COL_SPAN[cols]} ${ROW_SPAN[rows]}`,
    // Grand corps dans les blocs multi-lignes (l'unité de la grille 10 col
    // est assez large), petit corps dans les bandes d'une ligne.
    // Corps +75 % en lg (demande client 23/07) ; sous lg, échelle mobile
    // dédiée — le corps lg dans des cellules de ~150px multiplie les césures
    // et fait clipper les blocs.
    textClass:
      rows >= 2
        ? "text-[17px] lg:text-[clamp(23px,2.45vw,32px)]"
        : "text-[15px] lg:text-[clamp(19px,1.9vw,25px)]",
    // Une case de haut = pas de place pour deux étages : le compte de titres
    // s'efface au profit du libellé, libre de passer sur deux lignes
    // (amendement client 23/07 — le compte reste visible sur les blocs).
    showCount: rows >= 2,
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
  showCount,
}: {
  href: string;
  active: boolean;
  span: string;
  textClass: string;
  label: string;
  count: number;
  /** Masqué dans les cellules d'une case de haut — le libellé y prend toute
   *  la place et peut passer sur deux lignes. */
  showCount: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col justify-end gap-1 overflow-hidden px-[13px] py-[9px] transition-colors motion-reduce:transition-none focus-visible:z-[2] ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${span} ${invertingCell(active)}`}
    >
      <span
        className={`font-sans font-black uppercase leading-[1.02] tracking-[.01em] hyphens-auto [overflow-wrap:break-word] ${textClass}`}
      >
        {label}
        {!showCount && <span className="sr-only"> ({count} titres)</span>}
      </span>
      {showCount && (
        <span className="font-sans text-[13px] font-bold uppercase tracking-[.05em] opacity-60 lg:text-[17px]">
          {count} titres
        </span>
      )}
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
  return (
    <FramedGrid
      as="nav"
      aria-label={ariaLabel}
      className={`grid-flow-row-dense auto-rows-[clamp(64px,6.5vw,88px)] grid-cols-5 lg:grid-cols-10 ${className}`}
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
            showCount={span.showCount}
          />
        );
      })}
    </FramedGrid>
  );
}
