import type { CSSProperties } from "react";
import Link from "next/link";
import { FramedGrid } from "./framed-grid";
import { LibelleViewSwitch } from "./libelle-view-switch";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Vue des libellés du catalogue — l'UNIQUE rendu des libellés, consommé par
 * /catalogue ET /catalogue/[edition]. L'ordre des items vient de `getFacets`
 * (alphabétique — arbitrage client 22/07 : pas de tri par taille).
 *
 * Retour client 2026-07-23 (« ça prend trop de place ») : la grande mosaïque
 * en grille pondérée (vue « GEME », historique git de ce fichier) est
 * remplacée par DEUX vues en liste horizontale, entre lesquelles un switch
 * client TEMPORAIRE (`LibelleViewSwitch`) permet de basculer le temps que le
 * client compare et tranche :
 *
 * - « Rectangles simples » (défaut) : étiquettes uniformes, la recette `Tag`
 *   historique des filtres — `{nom} (n)` sur le quadrillage brutaliste.
 * - « Cases variables » : même liste horizontale, mais corps et padding de
 *   chaque case croissent avec le rayon — par TRANCHES de carrés parfaits de
 *   l'aire `round(√(nb titres))` (la loi de taille de l'ex-mosaïque,
 *   conservée) : k = floor(√aire), progression fixe par tranche, plafonnée
 *   au lisible. Les cases d'une même rangée s'étirent à la hauteur de la
 *   plus grande (align-items par défaut du flex) : pas de trous noirs.
 *
 * Dans les deux vues, cellule active inversée noir/blanc (`invertingCell`).
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
 * +1 sur les aires premières ≥ 5 (héritage de la loi de taille mosaïque,
 * conservé pour que les tranches restent identiques à ce que le client a
 * déjà vu).
 */
function cellArea(count: number) {
  const area = Math.max(1, Math.round(Math.sqrt(Math.max(0, count))));
  return area >= 5 && isPrime(area) ? area + 1 : area;
}

/**
 * Poids compact d'un libellé : k = floor(√aire) (tranches de carrés
 * parfaits — aires 1-3 → k=1, 4-8 → k=2, 9-15 → k=3…), corps et paddings en
 * progression fixe par tranche, plafonnés au lisible.
 */
function compactTier(count: number) {
  const k = Math.floor(Math.sqrt(cellArea(count)));
  return {
    font: Math.min(11 + 4 * k, 27),
    padY: Math.min(5 + 3 * k, 17),
    padX: Math.min(10 + 4 * k, 24),
  };
}

export interface LibelleMosaicItem {
  name: string;
  /** `null` = cellule « Tous les livres » (aucun libellé actif). */
  slug: string | null;
  count: number;
}

/** Étiquette uniforme — la recette `Tag` historique des filtres, en lien. */
function SimpleCell({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap px-3.5 py-2.5 text-[13px] font-bold uppercase tracking-[.03em] transition-colors motion-reduce:transition-none focus-visible:z-[2] ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`}
    >
      {label} <span className="opacity-60">({count})</span>
    </Link>
  );
}

/** Case pondérée de la vue compacte — corps/padding par tranche d'aire. */
function CompactCell({
  href,
  active,
  label,
  count,
  font,
  padY,
  padX,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  font: number;
  padY: number;
  padX: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={
        {
          "--fs": `${font}px`,
          "--py": `${padY}px`,
          "--px": `${padX}px`,
        } as CSSProperties
      }
      className={`flex items-baseline gap-2 px-[var(--px)] py-[var(--py)] transition-colors motion-reduce:transition-none focus-visible:z-[2] ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`}
    >
      <span className="font-sans text-[length:var(--fs)] font-black uppercase leading-none tracking-[.01em]">
        {label}
      </span>
      <span className="whitespace-nowrap font-sans text-[10px] font-bold uppercase tracking-[.05em] opacity-60">
        {count}
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
  const isActive = (item: LibelleMosaicItem) =>
    (item.slug ?? undefined) === activeLibelle;

  return (
    <LibelleViewSwitch
      className={className}
      simple={
        <FramedGrid as="nav" flow="flex" aria-label={ariaLabel}>
          {items.map((item) => (
            <SimpleCell
              key={item.slug ?? "all"}
              href={hrefFor(item.slug)}
              active={isActive(item)}
              label={item.name}
              count={item.count}
            />
          ))}
        </FramedGrid>
      }
      compact={
        <FramedGrid as="nav" flow="flex" aria-label={ariaLabel}>
          {items.map((item) => {
            const tier = compactTier(item.count);
            return (
              <CompactCell
                key={item.slug ?? "all"}
                href={hrefFor(item.slug)}
                active={isActive(item)}
                label={item.name}
                count={item.count}
                font={tier.font}
                padY={tier.padY}
                padX={tier.padX}
              />
            );
          })}
        </FramedGrid>
      }
    />
  );
}
