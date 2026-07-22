import Link from "next/link";
import { FramedGrid } from "./framed-grid";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Mosaïque pondérée des libellés du catalogue — LA vue « GEME » retenue par
 * le client (20/07) pour toutes les vues catalogue : des cases dont la taille
 * suit le nombre de titres, sur le quadrillage brutaliste noir 2px, cellule
 * active inversée noir/blanc. Extraite de /catalogue/[edition] pour vivre UNE
 * fois — consommée par /catalogue ET /catalogue/[edition] ; l'ordre des items
 * vient de `getFacets` (count décroissant), la grille dense se charge du
 * placement visuel.
 */

/** Poids visuel d'une cellule selon son nombre de titres. */
const THEME_TIERS: { min: number; span: string; text: string }[] = [
  {
    min: 16,
    span: "col-span-2 lg:col-span-3 row-span-2",
    text: "text-[clamp(14px,1.5vw,20px)] lg:text-[clamp(19px,2vw,29px)]",
  },
  { min: 12, span: "col-span-2 row-span-2", text: "text-[clamp(14px,1.5vw,20px)]" },
  { min: 9, span: "col-span-2 row-span-1", text: "text-[clamp(14px,1.5vw,20px)]" },
  { min: 7, span: "col-span-1 row-span-2", text: "text-[clamp(12px,1.2vw,15px)]" },
  { min: 0, span: "col-span-1 row-span-1", text: "text-[clamp(12px,1.2vw,15px)]" },
];

function themeTier(count: number) {
  return THEME_TIERS.find((t) => count >= t.min) ?? THEME_TIERS[THEME_TIERS.length - 1];
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
      className={`relative flex flex-col justify-end gap-1.5 overflow-hidden px-[17px] py-[15px] transition-colors motion-reduce:transition-none focus-visible:z-[2] ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${span} ${invertingCell(active)}`}
    >
      <span className={`font-sans font-black uppercase leading-[1.02] tracking-[.01em] ${textClass}`}>
        {label}
      </span>
      <span className="font-sans text-[11px] font-bold uppercase tracking-[.05em] opacity-60">
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
  return (
    <FramedGrid
      as="nav"
      aria-label={ariaLabel}
      className={`grid-flow-row-dense auto-rows-[clamp(62px,7vw,92px)] grid-cols-2 lg:grid-cols-6 ${className}`}
    >
      {items.map((item) => {
        const tier = themeTier(item.count);
        const active = (item.slug ?? undefined) === activeLibelle;
        return (
          <ThemeCell
            key={item.slug ?? "all"}
            href={hrefFor(item.slug)}
            active={active}
            span={tier.span}
            textClass={tier.text}
            label={item.name}
            count={item.count}
          />
        );
      })}
    </FramedGrid>
  );
}
