import type { CSSProperties } from "react";
import Link from "next/link";
import { FramedGrid } from "./framed-grid";
import { LibelleViewSwitch } from "./libelle-view-switch";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Vue des libellés du catalogue — l'UNIQUE rendu des libellés, consommé par
 * /catalogue ET /catalogue/[edition]. Deux vues derrière le switch client
 * TEMPORAIRE (`LibelleViewSwitch`), le temps que le client compare et
 * tranche (retour 2026-07-23 : la grande mosaïque en grille prenait trop de
 * place — elle vit dans l'historique git de ce fichier) :
 *
 * - « Rectangles simples » (défaut) : étiquettes uniformes dans l'ordre de
 *   `getFacets` (alphabétique), la recette `Tag` historique des filtres.
 * - « Cases variables » (spéc. Youri 2026-07-24, remplace la 1re version aux
 *   trous noirs ; finitions du même jour) : ÉTAGES de cases d'épaisseur
 *   uniforme par étage, items triés par nombre de titres DÉCROISSANT (copie
 *   locale — l'ordre des facettes reste alphabétique en amont). L'étage i
 *   héberge i cases (1, 2, 3…), le dernier prend le reliquat (cases à parts
 *   égales) ; l'épaisseur n'est plus imposée : elle suit le corps du texte
 *   (décroissant par rang, à peine lisible en bas — cf. `tierMetrics`),
 *   « Tous les livres » reste donc une case fine à grand corps, et le compte
 *   vit en coin bas-droit à corps fixe.
 *
 * Dans les deux vues, cellule active inversée noir/blanc (`invertingCell`).
 */

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

/* ---------------- Vue « cases variables » en étages ---------------- */

/**
 * Répartition en étages : l'étage i (1-indexé) héberge i cases ; le dernier
 * étage prend simplement le reliquat (ses cases se partagent la largeur à
 * parts égales — jamais de trou).
 */
function tierRows<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let start = 0, size = 1; start < items.length; start += size, size++) {
    rows.push(items.slice(start, start + size));
  }
  return rows;
}

/**
 * Métriques d'un étage — calées sur son RANG (pas sur son nombre réel de
 * cases : un dernier étage incomplet resterait sinon plus épais que
 * l'avant-dernier). Finitions client 24/07 : plus AUCUNE épaisseur imposée —
 * la hauteur d'une case = son corps + le padding uniforme (py-2), donc
 * « Tous les livres » (36px) reste une case FINE malgré son grand corps, et
 * les étages profonds descendent à peine lisible (corps 6 + 30/i :
 * 36 → 21 → 16 → 14 → 12 → 11, plancher 10 ; mobile ×0,62, plancher 9).
 * Les cases restent des cibles < 44px sur les étages profonds : entorse à
 * R7 assumée par le client (densité voulue de la vue).
 */
function tierMetrics(rank: number) {
  const fontLg = Math.max(10, Math.round(6 + 30 / rank));
  return {
    fontLg,
    fontSm: Math.max(9, Math.round(fontLg * 0.62)),
  };
}

/**
 * Case d'un étage — corps hérité de l'étage via variables CSS. Le compte de
 * titres vit en COIN bas-droit, en absolu et à corps fixe : dans le flux du
 * libellé, il décalait le centrage d'une case à l'autre.
 */
function TierCell({
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
      className={`relative flex min-w-0 flex-1 items-center justify-center px-3 py-2 text-center transition-colors motion-reduce:transition-none focus-visible:z-[2] ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`}
    >
      <span className="font-sans text-[length:var(--fs-sm)] font-black uppercase leading-[1.05] tracking-[.01em] [overflow-wrap:break-word] lg:text-[length:var(--fs)]">
        {label}
      </span>
      <span
        aria-hidden="true"
        className="absolute bottom-0.5 right-1.5 whitespace-nowrap font-sans text-[9px] font-bold opacity-60"
      >
        ({count})
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

  // Tri par taille de catalogue décroissant, égalités à l'alphabétique —
  // copie locale : `items` (ordre alphabétique de getFacets) sert tel quel
  // à la vue simple.
  const byCount = [...items].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"),
  );
  const rows = tierRows(byCount);

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
        <FramedGrid as="nav" aria-label={ariaLabel} className="grid-cols-1">
          {rows.map((row, i) => {
            const m = tierMetrics(i + 1);
            return (
              <div
                key={i}
                className="flex gap-[2px]"
                style={
                  {
                    "--fs": `${m.fontLg}px`,
                    "--fs-sm": `${m.fontSm}px`,
                  } as CSSProperties
                }
              >
                {row.map((item) => (
                  <TierCell
                    key={item.slug ?? "all"}
                    href={hrefFor(item.slug)}
                    active={isActive(item)}
                    label={item.name}
                    count={item.count}
                  />
                ))}
              </div>
            );
          })}
        </FramedGrid>
      }
    />
  );
}
