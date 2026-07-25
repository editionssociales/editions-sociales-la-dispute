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
 * Métriques d'un étage — corps ET épaisseur EXACTEMENT proportionnels à
 * l'inverse du RANG de l'étage (retour Youri 25/07) :
 *
 * - corps : `FONT_BASE / rang`, arrondi au dixième → 60-30-20-15-12-10 px.
 * - épaisseur : `THICK_BASE / rang`, SAUF l'étage 1 (« Tous les livres »),
 *   laissé en hauteur automatique — c'est la bannière du catalogue, elle se
 *   règle sur son propre corps.
 *
 * `THICK_BASE` vaut 1,3 × `FONT_BASE` : le rapport hauteur/corps reste donc
 * constant d'un étage à l'autre, ce qui laisse toujours la même marge à un
 * libellé d'une ligne. Imposer la hauteur retire la latitude du padding
 * vertical — les cases des étages 2+ passent en `py-0` + `overflow-hidden`,
 * sinon `py-2` (16px) déborderait à lui seul les étages profonds (13px de
 * haut au rang 6). Un libellé qui passerait à deux lignes y est donc rogné :
 * c'est le prix de l'épaisseur exacte.
 *
 * Le calage sur le NOMBRE DE CASES (essayé le même jour) est écarté : un
 * dernier étage incomplet — 19 libellés donnent 1-2-3-4-5-4 cases — revenait
 * à la taille de l'étage de même largeur et cassait la décroissance.
 *
 * Ni terme constant ni plancher (auparavant `6 + 30/rang`, planchers 10px
 * desktop et 9px mobile) : ils écrasaient la pente en bas, et le plancher
 * mobile bloquait net à 9px dès l'étage 4. Corps FRACTIONNAIRES et non
 * entiers : sous ~8px, l'arrondi à l'unité remettait des étages à égalité —
 * soit la pente écrasée qu'on vient de corriger.
 *
 * Le compte en coin suit le corps de l'étage (`--fsc`) plafonné à 9px, sinon
 * il devient plus gros que le libellé qu'il annote sur les étages profonds.
 * Les cases restent des cibles < 44px sur ces étages : entorse à R7 assumée
 * par le client (densité voulue de la vue).
 */
const FONT_BASE = 60;
const THICK_BASE = FONT_BASE * 1.3;
/** Facteur mobile, appliqué au corps comme à l'épaisseur. */
const SM_RATIO = 0.62;

const round1 = (n: number) => Math.round(n * 10) / 10;

function tierMetrics(rank: number) {
  const fontLg = round1(FONT_BASE / rank);
  const fontSm = round1(fontLg * SM_RATIO);
  return {
    fontLg,
    fontSm,
    countLg: Math.min(9, fontLg),
    countSm: Math.min(8, fontSm),
    // Étage 1 (« Tous les livres ») : hauteur automatique, jamais imposée.
    thickLg: rank === 1 ? null : round1(THICK_BASE / rank),
    thickSm: rank === 1 ? null : round1((THICK_BASE * SM_RATIO) / rank),
  };
}

/**
 * Case d'un étage — corps hérité de l'étage via variables CSS. Le compte de
 * titres vit en COIN bas-droit, en absolu et à corps fixe : dans le flux du
 * libellé, il décalait le centrage d'une case à l'autre.
 *
 * `fixedHeight` : l'étage impose sa hauteur (tous sauf « Tous les livres »).
 * La case perd alors son padding vertical — `py-2` (16px) déborderait à lui
 * seul les étages profonds — et clippe ce qui dépasse.
 */
function TierCell({
  href,
  active,
  label,
  count,
  fixedHeight,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  fixedHeight: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-w-0 flex-1 items-center justify-center overflow-hidden px-3 text-center transition-colors motion-reduce:transition-none focus-visible:z-[2] ${fixedHeight ? "" : "py-2"} ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`}
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
        const m = tierMetrics(i + 1);
        return (
          <div
            key={i}
            className={`flex gap-[2px] ${m.thickLg == null ? "" : "h-[var(--th-sm)] lg:h-[var(--th)]"}`}
            style={
              {
                "--fs": `${m.fontLg}px`,
                "--fs-sm": `${m.fontSm}px`,
                "--fsc": `${m.countLg}px`,
                "--fsc-sm": `${m.countSm}px`,
                ...(m.thickLg != null && {
                  "--th": `${m.thickLg}px`,
                  "--th-sm": `${m.thickSm}px`,
                }),
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
                fixedHeight={m.thickLg != null}
              />
            ))}
          </div>
        );
      })}
    </FramedGrid>
  );
}
