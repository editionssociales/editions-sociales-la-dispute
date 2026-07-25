import type { CSSProperties } from "react";
import Link from "next/link";
import { FramedGrid } from "./framed-grid";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Vue des libellés du catalogue — l'UNIQUE rendu des libellés, consommé par
 * /catalogue ET /catalogue/[edition]. Une SEULE vue depuis l'arbitrage du
 * 2026-07-25 : « cases variables » (spéc. Youri 2026-07-24, remplace la 1re
 * version aux trous noirs). Le switch temporaire `LibelleViewSwitch` et la
 * vue « rectangles simples » qu'il opposait sont supprimés — comme la grande
 * mosaïque en grille avant eux, ils vivent dans l'historique git.
 *
 * ÉTAGES de cases, items triés par nombre de titres DÉCROISSANT (copie
 * locale — l'ordre des facettes reste alphabétique en amont). L'étage i
 * héberge i cases (1, 2, 3…), le dernier prend le reliquat (cases à parts
 * égales) ; l'épaisseur n'est jamais imposée : elle suit le corps du texte,
 * qui décroît fortement par rang (cf. `tierMetrics`). « Tous les livres »
 * reste donc une case fine à grand corps, et le compte vit en coin bas-droit.
 * Cellule active inversée noir/blanc (`invertingCell`).
 */

export interface LibelleMosaicItem {
  name: string;
  /** `null` = cellule « Tous les livres » (aucun libellé actif). */
  slug: string | null;
  count: number;
}

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
 * Métriques d'un étage — corps EXACTEMENT proportionnel à l'inverse de son
 * NOMBRE DE CASES (36/n, arrondi au dixième ; retour Youri 25/07, remplace le
 * calage sur le rang). Les cases d'un étage se partageant sa largeur à parts
 * égales, le corps suit donc la largeur d'une case : plus il y a de cases,
 * plus elles sont étroites, plus le texte est petit.
 *
 * Conséquence assumée : un DERNIER étage incomplet (reliquat) revient à la
 * taille de l'étage de même nombre de cases — avec 19 libellés, les étages
 * font 1-2-3-4-5-4 cases, donc 36-18-12-9-7,2-9px. C'est le prix de la règle
 * demandée ; le calage sur le rang, qui gardait une pente strictement
 * décroissante, est dans l'historique git.
 *
 * Ni terme constant ni plancher (auparavant `6 + 30/rang`, planchers 10px
 * desktop et 9px mobile) : ils écrasaient la pente en bas (36-21-16-14-12-11,
 * et le plancher mobile bloquait net à 9px dès l'étage 4). Corps
 * FRACTIONNAIRES et non entiers : sous ~8px, l'arrondi à l'unité remettait
 * des étages à égalité — soit la pente écrasée qu'on vient de corriger.
 *
 * Plus AUCUNE épaisseur imposée : la hauteur d'une case = son corps + le
 * padding uniforme (py-2), donc « Tous les livres » reste une case FINE
 * malgré son grand corps. Le compte en coin suit le corps de l'étage
 * (`--fsc`) plafonné à 9px, sinon il devient plus gros que le libellé qu'il
 * annote sur les étages profonds. Les cases restent des cibles < 44px sur
 * ces étages : entorse à R7 assumée par le client (densité voulue de la vue).
 */
const round1 = (n: number) => Math.round(n * 10) / 10;

function tierMetrics(cases: number) {
  const fontLg = round1(36 / cases);
  const fontSm = round1(fontLg * 0.62);
  return {
    fontLg,
    fontSm,
    countLg: Math.min(9, fontLg),
    countSm: Math.min(8, fontSm),
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
        className="absolute bottom-0.5 right-1.5 whitespace-nowrap font-sans text-[length:var(--fsc-sm)] font-bold opacity-60 lg:text-[length:var(--fsc)]"
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

  // Tri par taille de catalogue décroissant, égalités à l'alphabétique. La
  // COPIE est le contrat (`src/lib/CLAUDE.md`) : `getFacets` détient l'ordre
  // alphabétique, cette vue ne trie jamais le tableau de l'appelant en place.
  const byCount = [...items].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"),
  );
  const rows = tierRows(byCount);

  return (
    <FramedGrid
      as="nav"
      aria-label={ariaLabel}
      className={`grid-cols-1 ${className}`}
    >
      {rows.map((row, i) => {
        const m = tierMetrics(row.length);
        return (
          <div
            key={i}
            className="flex gap-[2px]"
            style={
              {
                "--fs": `${m.fontLg}px`,
                "--fs-sm": `${m.fontSm}px`,
                "--fsc": `${m.countLg}px`,
                "--fsc-sm": `${m.countSm}px`,
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
  );
}
