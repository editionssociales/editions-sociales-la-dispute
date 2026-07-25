"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Déroulé des étages de la mosaïque de libellés (`libelle-mosaic.tsx`) —
 * l'îlot client de cette vue, qui reste serveur : la case « Tous les livres »
 * (rang 1) gagne une bascule chevron, et TOUS les étages suivants vivent
 * derrière elle, repliés par défaut.
 *
 * Même grammaire que le menu du header (`site-header.tsx`) : `<button
 * aria-expanded>`, panneau TOUJOURS monté dont la grille interpole
 * `0fr → 1fr` (seule façon d'animer une hauteur `auto` sans la mesurer),
 * `inert` replié, chevron retourné — et, comme lui, PAS de
 * `motion-reduce:transition-none` : le déroulé dit où partent les libellés, et
 * iOS coupe le mouvement de tous ses navigateurs d'un coup.
 *
 * La case « Tous les livres » RESTE un lien (retour au catalogue sans
 * libellé) : elle est passée telle quelle en `banner` par la vue serveur, la
 * bascule est une cellule VOISINE dans la rangée. Une case qui serait à la
 * fois lien et bouton perdrait l'une des deux fonctions.
 *
 * Tout ce qui traverse la frontière serveur → client est sérialisable
 * (noeuds déjà rendus + objet de style) : la vue garde ses formules de
 * métriques et son `hrefFor` (une fonction, non sérialisable) côté serveur.
 */

/** Chevron de la bascule — même dessin que le header (angles droits, R8). */
function ChevronGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 8 L12 17 L20 8" />
    </svg>
  );
}

export function MosaicDisclosure({
  banner,
  bannerStyle,
  bannerActive,
  children,
}: {
  /** La case « Tous les livres », rendue par la vue serveur. */
  banner: ReactNode;
  /** Variables CSS de l'étage 1 (corps, compte) — portées par la rangée. */
  bannerStyle: CSSProperties;
  /** La case est-elle l'état courant (aucun libellé filtré) ? */
  bannerActive: boolean;
  /** Les étages suivants, chacun déjà stylé par la vue serveur. */
  children: ReactNode;
}) {
  // Replié par défaut — SAUF quand un libellé est filtré : les étages portent
  // alors la seule marque du filtre courant (la case active, inversée), et les
  // puces de libellés sont masquées sur ces pages (`hideLibelles`). Replier
  // reviendrait à cacher où l'on se trouve.
  const [open, setOpen] = useState(!bannerActive);
  const panelId = useId();

  return (
    // Un SEUL enfant de la `FramedGrid` : sinon sa gouttière de 2px resterait
    // peinte sous la bannière une fois les étages repliés.
    <div className="flex flex-col">
      <div className="flex gap-[2px]" style={bannerStyle}>
        {banner}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Replier les libellés" : "Déplier les libellés"}
          onClick={() => setOpen((previous) => !previous)}
          // Même tonalité que la bannière qu'elle prolonge (`invertingCell`) :
          // la bascule est une case du quadrillage, pas un bouton rapporté.
          className={`flex w-14 shrink-0 items-center justify-center transition-colors duration-200 ease-out ${
            bannerActive ? FOCUS_RING_DARK : FOCUS_RING_LIGHT
          } ${invertingCell(bannerActive)}`}
        >
          <span
            className={`inline-block transition-transform duration-300 ease-out ${
              open ? "rotate-180" : ""
            }`}
          >
            <ChevronGlyph />
          </span>
        </button>
      </div>

      <div
        id={panelId}
        inert={!open}
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        {/* L'item de grille ne porte que le clipping (`min-h-0` : sans lui, sa
            taille minimale automatique empêcherait la rangée de tomber à 0) ;
            la gouttière du haut vit un cran plus bas, sinon elle survivrait au
            repli. */}
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-[2px] pt-[2px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
