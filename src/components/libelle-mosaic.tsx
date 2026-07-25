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
 * - corps : `80 / rang` en desktop, `40 / rang` en mobile (arrondis au
 *   dixième) → 80-40-26,7-20-16-13,3 px et 40-20-13,3-10-8-6,7 px.
 *   SEULE exception, l'étage 1 (« Tous les livres ») porte 30 % de moins
 *   (`TIER1_FONT_RATIO`) : sa case est une bannière pleine largeur, le corps
 *   de formule y était démesuré. La réduction est locale au rang 1 — la
 *   formule des autres étages n'en est jamais affectée.
 * - épaisseur : `240 / rang` en desktop, `120 / rang` en mobile, SAUF ce même
 *   étage 1, laissé en hauteur automatique : c'est la bannière du catalogue,
 *   elle se règle sur son propre corps.
 *
 * Les deux paliers ont leurs PROPRES bases (et non plus un facteur mobile
 * appliqué au desktop) : les quatre valeurs sont posées telles quelles par le
 * client. Le rapport épaisseur/corps y reste constant — 3 des deux côtés —,
 * ce qui laisse partout la même marge autour du libellé. Imposer la hauteur
 * retire la latitude du padding vertical : les cases des étages 2+ passent en
 * `py-0` + `overflow-hidden`, sinon `py-2` (16px) mangerait à lui seul
 * l'essentiel des étages profonds.
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
const FONT_BASE_LG = 80;
const FONT_BASE_SM = 40;
const THICK_BASE_LG = 240;
const THICK_BASE_SM = 120;
/** Abattement du seul rang 1 (« Tous les livres »), −30 %. */
const TIER1_FONT_RATIO = 0.7;

const round1 = (n: number) => Math.round(n * 10) / 10;

function tierMetrics(rank: number) {
  const abattement = rank === 1 ? TIER1_FONT_RATIO : 1;
  const fontLg = round1((FONT_BASE_LG / rank) * abattement);
  const fontSm = round1((FONT_BASE_SM / rank) * abattement);
  return {
    fontLg,
    fontSm,
    countLg: Math.min(9, fontLg),
    countSm: Math.min(8, fontSm),
    // Étage 1 (« Tous les livres ») : hauteur automatique, jamais imposée.
    thickLg: rank === 1 ? null : round1(THICK_BASE_LG / rank),
    thickSm: rank === 1 ? null : round1(THICK_BASE_SM / rank),
  };
}

/** Longueur maximale d'un libellé AFFICHÉ (retour Youri 25/07). */
const MAX_LABEL = 20;

/**
 * Coupe un libellé trop long sur une frontière de MOT : on garde les mots
 * entiers tant qu'on tient dans `MAX_LABEL`, jamais une troncature au milieu
 * d'un mot. La ponctuation de liaison restée en fin de coupe est retirée —
 * « État, droit & institutions » donne « État, droit », pas « État, droit & »,
 * qui annoncerait un mot absent. Repli : un premier mot déjà plus long que la
 * limite est gardé ENTIER (le couper au caractère produirait un fragment
 * illisible).
 *
 * Le nom complet n'est jamais perdu pour autant : la case coupée porte le
 * libellé entier en `sr-only` et masque sa version courte à l'arbre a11y —
 * sinon la troncature dégraderait aussi le nom accessible du lien.
 */
function truncateWords(label: string) {
  if (label.length <= MAX_LABEL) return label;
  let out = "";
  for (const word of label.split(" ")) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > MAX_LABEL) break;
    out = next;
  }
  return (out || label.split(" ")[0]).replace(/[\s,&·–-]+$/u, "");
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
  const short = truncateWords(label);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-w-0 flex-1 items-center justify-center overflow-hidden px-3 text-center transition-colors motion-reduce:transition-none focus-visible:z-[2] ${fixedHeight ? "" : "py-2"} ${active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(active)}`}
    >
      {short !== label && <span className="sr-only">{label}</span>}
      <span
        aria-hidden={short === label ? undefined : "true"}
        className="font-sans text-[length:var(--fs-sm)] font-black uppercase leading-[1.05] tracking-[.01em] [overflow-wrap:break-word] lg:text-[length:var(--fs)]"
      >
        {short}
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
