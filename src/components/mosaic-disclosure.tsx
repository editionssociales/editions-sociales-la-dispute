"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

/**
 * Déroulé des étages de la mosaïque de libellés (`libelle-mosaic.tsx`) —
 * l'îlot client de cette vue, qui reste serveur.
 *
 * Repli MOBILE UNIQUEMENT (retour client 29/08 : « que les thèmes restent
 * toujours visibles, sauf mobile ») — à `lg` et au-delà, les étages sont
 * TOUJOURS visibles et aucun bouton n'est rendu : `useMediaQuery` (fail-open
 * « non mobile », doctrine `hooks/use-media-query`) pilote `inert`, pendant
 * que les classes littérales `lg:` couvrent l'affichage — sans elles, une
 * bascule repliée par défaut (le cas neutre, « Tous les livres » actif)
 * rendrait les étages inertes même en grand écran.
 *
 * Sous `lg`, même grammaire que le menu du header (`site-header.tsx`) :
 * `<button aria-expanded>` porte l'état, panneau TOUJOURS monté dont la
 * grille interpole `0fr → 1fr` (seule façon d'animer une hauteur `auto` sans
 * la mesurer), `inert` replié, chevron retourné — et, comme lui, PAS de
 * `motion-reduce:transition-none` : le déroulé dit où partent les libellés, et
 * iOS coupe le mouvement de tous ses navigateurs d'un coup. Le déclencheur
 * n'est plus un carré icône-seule (chevron muet, retiré le 29/08) : une barre
 * pleine largeur porte le libellé texte visible « Trier par thème » — un
 * déclencheur icône-seule n'est légitime que pour une icône universellement
 * apprise (hamburger), cf. `src/components/CLAUDE.md`.
 *
 * La case « Tous les livres » RESTE un lien (retour au catalogue sans
 * libellé) : elle est passée telle quelle en `banner` par la vue serveur,
 * seule dans sa rangée — la bascule mobile vit maintenant dans SA PROPRE
 * barre, en dessous, plus dans une case voisine (elle ne tient plus à côté
 * d'une bannière pleine largeur).
 *
 * Tout ce qui traverse la frontière serveur → client est sérialisable
 * (noeuds déjà rendus + objet de style) : la vue garde ses formules de
 * métriques et son `hrefFor` (une fonction, non sérialisable) côté serveur.
 */

/** Sous le point de rupture `lg` de Tailwind (1024px) exclusivement — même
 *  seuil que `BottomSheet`. */
const MOBILE_QUERY = "(max-width: 1023.98px)";

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
  /** Variables CSS de l'étage 1 (corps) — portées par la rangée. */
  bannerStyle: CSSProperties;
  /** La case est-elle l'état courant (aucun libellé filtré) ? */
  bannerActive: boolean;
  /** Les étages suivants, chacun déjà stylé par la vue serveur. */
  children: ReactNode;
}) {
  // Replié par défaut — SAUF quand un libellé est filtré : les étages portent
  // alors la seule marque du filtre courant (la case active, inversée), et les
  // puces de libellés sont masquées sur ces pages (`hideLibelles`). Replier
  // reviendrait à cacher où l'on se trouve. Ne pilote plus rien à `lg`+.
  const [open, setOpen] = useState(!bannerActive);
  // Fail-open « non mobile » (cf. doctrine du hook) : avant hydratation, et
  // sur un vrai grand écran, les étages restent inertes UNIQUEMENT si ce
  // booléen les considère mobiles ET repliés — jamais à `lg`+.
  const mobile = useMediaQuery(MOBILE_QUERY);
  const panelId = useId();
  const collapsed = mobile && !open;

  return (
    // Un SEUL enfant de la `FramedGrid` : sinon sa gouttière de 2px resterait
    // peinte sous la bannière une fois les étages repliés.
    <div className="flex flex-col">
      <div className="flex gap-[2px]" style={bannerStyle}>
        {banner}
      </div>

      {/* Barre de bascule — MOBILE UNIQUEMENT (`lg:hidden`, classe littérale :
          à `lg`+ elle disparaît, les étages restants n'ont plus besoin d'être
          révélés). Pleine largeur, libellé texte visible + chevron — même
          esprit que le bandeau de `BottomSheet` (`bottom-sheet.tsx`). */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((previous) => !previous)}
        className={`mt-[2px] flex w-full items-center justify-center gap-2 py-2.5 font-sans text-[0.8125rem] font-extrabold uppercase leading-none tracking-[.06em] transition-colors duration-200 ease-out lg:hidden ${
          bannerActive ? FOCUS_RING_DARK : FOCUS_RING_LIGHT
        } ${invertingCell(bannerActive)}`}
      >
        Trier par thème
        <span
          className={`inline-block transition-transform duration-300 ease-out ${
            open ? "rotate-180" : ""
          }`}
        >
          <ChevronGlyph />
        </span>
      </button>

      <div
        id={panelId}
        inert={collapsed}
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out lg:grid-rows-[1fr] lg:opacity-100 ${
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
