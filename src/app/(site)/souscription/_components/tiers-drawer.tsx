"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { FOCUS_RING_INVERTING } from "@/lib/ui";
import {
  RAIL_EDGE_TRANSITION_CLASS,
  RAIL_OPEN_PROPERTY,
  TICKER_INSET_CLASS,
} from "@/components/rail-inset";

/**
 * Tiroir des contreparties — le pendant DESKTOP (`lg` et au-delà) de la
 * feuille de bas d'écran (`bottom-sheet.tsx`) : une seule et même grammaire de
 * déroulé, deux régimes d'affichage. Sous `lg` ce composant est TRANSPARENT
 * (il rend ses enfants tels quels) et la feuille garde son comportement exact.
 *
 * Le PANNEAU est la colonne de droite de la grille de page, et rien d'autre :
 * `380px` ouvert, `0` fermé (`--rail-open`, `rail-inset.ts`), la course portée
 * par `grid-template-columns`. Aucune poignée n'est logée dans cette colonne —
 * les deux commandes sont FIXÉES au bord droit du viewport, où elles ne
 * coûtent aucune réserve de largeur :
 *
 * - la POIGNÉE d'ouverture, au milieu du bord droit, escamotée hors écran
 *   (`translate-x-full` + `inert`) tant que le tiroir est ouvert ;
 * - le bouton de FERMETURE, en haut du panneau, escamoté de la même façon une
 *   fois le tiroir fermé.
 *
 * Deux éléments simples plutôt qu'un seul qui voyagerait entre deux positions,
 * et tous deux sur la MÊME course que la colonne (`RAIL_EDGE_TRANSITION_CLASS`).
 *
 * Fail-open (doctrine `hooks/use-in-view`) : le HTML serveur rend le tiroir
 * OUVERT, avec les dix cartes en clair — `--rail-open` n'est jamais posée
 * côté serveur et `var(--rail-open, 1)` retombe sur 1. Un navigateur sans JS
 * (ou un bot) voit la liste entière, jamais une colonne effondrée.
 *
 * Le contenu vit dans un enfant de LARGEUR FIXE (`RAIL_CONTENT_WIDTH_CLASS`,
 * posée par `tiers-rail.tsx`), la colonne le rognant à l'horizontale
 * (`overflow-x-clip` — jamais `overflow-hidden`, qui ferait de la colonne un
 * conteneur de défilement et casserait le `sticky` du rail). Conséquence
 * voulue : la géométrie INTERNE du panneau ne change pas d'un pixel pendant la
 * course, une ancre y est donc mesurable sans attendre la fin de l'animation.
 */

/** Sous le point de rupture `lg` de Tailwind (1024px), la feuille de bas d'écran règne. */
const MOBILE_QUERY = "(max-width: 1023.98px)";

/**
 * Chevron des commandes — même dessin que la bascule du header et que la
 * poignée de la feuille (angles droits, R8), tourné d'un quart de tour.
 * DUPLIQUÉ plutôt qu'importé de `bottom-sheet.tsx` : ce glyphe n'y est pas
 * exporté, et une tentative précédente est morte sur cet import fantôme.
 */
function ChevronGlyph({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 8 L12 17 L20 8" />
    </svg>
  );
}

export function TiersDrawer({ children }: { children: ReactNode }) {
  const mobile = useMediaQuery(MOBILE_QUERY);
  // Le tiroir NAÎT OUVERT : c'est l'état rendu par le serveur, et les
  // contreparties sont le point le plus urgent de la page.
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // La bascule CHANGE de place d'un état à l'autre (bord du viewport ↔ haut du
  // panneau) : au clavier, le bouton qu'on vient d'actionner s'escamote et le
  // focus tomberait sur le <body>. On le suit — après le commit, l'élément
  // visé étant encore `inert` pendant le rendu. Même mécanique que le header.
  const followFocus = useRef(false);
  const panelId = useId();

  const toggle = useCallback((next: boolean) => {
    followFocus.current = true;
    setOpen(next);
  }, []);

  useEffect(() => {
    if (!followFocus.current) return;
    followFocus.current = false;
    (open ? closeRef : handleRef).current?.focus();
  }, [open]);

  // Publication de l'état vers les DEUX autres consommateurs de la largeur (la
  // grille de `souscription/page.tsx` et la réserve du header) : une propriété
  // custom sur la racine, lue par leurs classes littérales. Un contexte React
  // ne les atteindrait pas — le header vit dans le layout, hors de l'arbre de
  // la page. Retirée au démontage : la propriété ne survit pas à la route.
  useEffect(() => {
    if (mobile) return;
    const root = document.documentElement;
    root.style.setProperty(RAIL_OPEN_PROPERTY, open ? "1" : "0");
    return () => {
      root.style.removeProperty(RAIL_OPEN_PROPERTY);
    };
  }, [mobile, open]);

  /**
   * Échap ferme le tiroir — écouté SUR le panneau et sur ses commandes,
   * JAMAIS sur `document` : le tiroir n'est pas modal, une touche pressée
   * ailleurs dans la page ne le concerne pas. Les champs de saisie (le
   * « montant libre » du formulaire vit DANS le panneau) sont exclus : Échap y
   * appartient au champ, pas au tiroir.
   */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape" || !open) return;
      const target = event.target as Element | null;
      if (target?.closest?.("input, textarea, select")) return;
      event.stopPropagation();
      toggle(false);
    },
    [open, toggle],
  );

  if (mobile) return <>{children}</>;

  return (
    <>
      {/* Poignée d'ouverture — fixée au bord droit du viewport, elle CHEVAUCHE
          le bord du contenu (motif standard du tiroir) et ne réserve donc
          aucune largeur dans la colonne. z-40 : sous le header (z-50) et sous
          le liseré de collecte (z-60), au-dessus de la page. */}
      <button
        ref={handleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        // Escamotée hors écran tant que le tiroir est ouvert : `inert` la sort
        // du parcours clavier ET de l'arbre a11y (jamais `hidden`, dont la
        // bascule serait sèche et qui empêcherait le focus de la SUIVRE).
        inert={open}
        onClick={() => toggle(true)}
        onKeyDown={onKeyDown}
        className={`fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 items-center gap-2 border-2 border-r-0 border-ink bg-pop-orange px-2 py-5 font-sans text-[0.8125rem] font-extrabold uppercase leading-none tracking-[.06em] text-ink hover:bg-ink hover:text-pop-orange lg:flex ${FOCUS_RING_INVERTING} ${RAIL_EDGE_TRANSITION_CLASS} ${
          open ? "translate-x-full" : "translate-x-0"
        }`}
      >
        <ChevronGlyph className="h-5 w-5 shrink-0 rotate-90" />
        <span className="[writing-mode:vertical-rl]">Contribuer</span>
      </button>

      {/* Bouton de fermeture — en haut du panneau (bord droit, sous le liseré
          de collecte), escamoté sur la même course une fois le tiroir fermé. */}
      <button
        ref={closeRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Replier les contreparties"
        inert={!open}
        onClick={() => toggle(false)}
        onKeyDown={onKeyDown}
        className={`fixed right-0 z-40 hidden h-11 w-11 items-center justify-center border-2 border-r-0 border-ink bg-pop-orange text-ink hover:bg-ink hover:text-pop-orange lg:flex ${TICKER_INSET_CLASS} ${FOCUS_RING_INVERTING} ${RAIL_EDGE_TRANSITION_CLASS} ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <ChevronGlyph className="h-5 w-5 shrink-0 -rotate-90" />
      </button>

      {/* LE PANNEAU : la colonne de droite de la grille de page. `self-stretch`
          lui donne la hauteur de la rangée entière — sans quoi le `sticky` du
          rail, qui n'est plus l'item de grille, n'aurait plus aucune course.
          `overflow-x-clip` (et non `overflow-hidden`) rogne l'horizontale sans
          faire de la colonne un conteneur de défilement : le `sticky` survit. */}
      <div
        id={panelId}
        ref={panelRef}
        // Replié, le panneau reste MONTÉ et sort du parcours clavier par
        // `inert` — jamais par `visibility`/`hidden` (grammaire des déroulés).
        inert={!open}
        onKeyDown={onKeyDown}
        className="min-w-0 lg:self-stretch lg:overflow-x-clip"
      >
        {children}
      </div>
    </>
  );
}
