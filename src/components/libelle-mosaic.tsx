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
 *   trous noirs) : ÉTAGES de cases d'épaisseur uniforme par étage, items
 *   triés par nombre de titres DÉCROISSANT (copie locale — l'ordre des
 *   facettes reste alphabétique en amont). L'étage i héberge i cases
 *   (1, 2, 3…), le dernier prend le reliquat (cases à parts égales) ;
 *   épaisseur et corps inversement proportionnels au rang de l'étage
 *   (`TIER_K / i`), plancher 44px (cible tactile R7) — les étages profonds
 *   se valent donc en hauteur, seule la typo continue de décroître.
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

/** Épaisseur de référence de l'étage 1 (px) — les suivants font TIER_K/i. */
const TIER_K = 144;
/** Plancher d'épaisseur : cible tactile R7 (44px ≈ min-h-11). */
const TIER_MIN_H = 44;

/**
 * Métriques d'un étage — calées sur son RANG (pas sur son nombre réel de
 * cases : un dernier étage incomplet resterait sinon plus épais que
 * l'avant-dernier). Corps 12 + 24/i : 36 → 24 → 20 → 18 → 17 → 16…, jamais
 * sous 12 ; corps mobile réduit (les mêmes étages tiennent sur 5-6 cases).
 */
function tierMetrics(rank: number) {
  const fontLg = Math.round(12 + 24 / rank);
  return {
    minH: Math.max(TIER_MIN_H, Math.round(TIER_K / rank)),
    fontLg,
    fontSm: Math.max(11, Math.round(fontLg * 0.62)),
  };
}

/** Case d'un étage — corps/épaisseur hérités de l'étage via variables CSS. */
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
      className={`flex min-h-[var(--h)] min-w-0 flex-1 items-center justify-center gap-x-2 px-3 py-2 text-center transition-colors motion-reduce:transition-none focus-visible:z-[2] ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`}
    >
      <span className="font-sans text-[length:var(--fs-sm)] font-black uppercase leading-[1.05] tracking-[.01em] [overflow-wrap:break-word] lg:text-[length:var(--fs)]">
        {label}
      </span>
      <span className="whitespace-nowrap font-sans text-[10px] font-bold uppercase tracking-[.05em] opacity-60 lg:text-[12px]">
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
                    "--h": `${m.minH}px`,
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
