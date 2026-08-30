"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FOCUS_RING_HOVER_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";

/**
 * Repli mobile de l'index-manifeste (retour client 2026-08-30, 3e-5e
 * passes) : sous `sm`, seules les DEUX premières lignes du paragraphe de
 * libellés sont visibles ; la flèche qui déplie vit AILLEURS dans la page —
 * centrée sur la ligne « N résultats », sous le filet noir (5e passe :
 * « gagner de la place verticalement », la flèche ne mérite pas sa propre
 * rangée). D'où le découpage en TROIS pièces sur un contexte partagé, même
 * patron que `catalogue-transition.tsx` : `MosaicClampProvider` (l'état),
 * `MosaicClamp` (le panneau écrêté, posé par `libelle-mosaic.tsx`),
 * `MosaicClampToggle` (la flèche, posée par les pages dans la ligne de
 * résultats). Sans provider, le panneau rend simplement tout (aucun
 * écrêtage) et la flèche ne rend rien — repli sûr pour tout autre appelant.
 *
 * Grammaire des déroulés (`src/components/CLAUDE.md`) : bouton
 * `aria-expanded`/`aria-controls`, chevron-triangle qui tourne (recette
 * `ChevronGlyph`, jamais un glyphe ▾), repli hors du parcours clavier/AT par
 * `inert` — jamais `visibility`. Le déclencheur est une FLÈCHE SEULE,
 * arbitrage client explicite (l'arbitrage du 29/08 imposait un libellé
 * texte au déroulé de la mosaïque d'alors ; sous une liste visiblement
 * tronquée, la flèche est jugée lisible) — le nom accessible complet reste
 * porté par `aria-label`.
 *
 * MÉCANIQUE : le repli est un `line-clamp-2` natif posé sur le WRAPPER
 * (WebKit legacy box, ellipse comprise : « … » REMPLACE la fin de la 2e
 * ligne — 6e passe du retour client, le dernier mot-clé coupé ne reste pas
 * en suspens ; fonctionne à travers un enfant bloc dans tous les moteurs,
 * `-webkit-line-clamp` étant supporté partout, Firefox compris). Le SEUIL
 * `inert` reste calé sur la hauteur de ces 2 lignes (24,4px chacune —
 * COUPLÉ au corps mobile du paragraphe, `text-[11.6px]` × `leading-[2.1]`
 * dans `libelle-mosaic.tsx` : changer l'un impose l'autre).
 * Impossible de poser `inert` sur « les lignes 3 et suivantes » côté
 * serveur : quels liens tombent sous le pli dépend de la largeur du
 * viewport et des retours à la ligne. Un effet MESURE donc après rendu
 * (`offsetTop` ≥ seuil, wrapper `relative` = référentiel) quels liens sont
 * écrêtés et pose l'attribut `inert` un par un, directement au DOM (ces
 * attributs ne sont pas gérés par React sur ces nœuds serveur — aucune
 * réconciliation ne les écrase). Avant hydratation : écrêtage visuel seul,
 * liens du pli encore tabulables un court instant — amélioration
 * progressive assumée.
 */

/** 2 × (11.6px × 2.1), arrondi au pixel sup — la hauteur des deux lignes que
 *  `line-clamp-2` laisse visibles, base du seuil `inert` ci-dessous. */
const CLAMP_PX = 49;
/** Sous `sm` (borne du drapeau gauche mobile du paragraphe). */
const MOBILE_QUERY = "(max-width: 639.98px)";
/** Une demi-ligne : place le seuil à mi-chemin entre le haut d'un lien de la
 *  ligne 2 (~22px) et d'un lien de la ligne 3 (~45px) — insensible aux
 *  arrondis de hauteur de ligne du navigateur. */
const CLAMP_EPSILON = 12;

const MosaicClampContext = createContext<{
  open: boolean;
  panelId: string;
  toggle: () => void;
} | null>(null);

export function MosaicClampProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const value = useMemo(
    () => ({ open, panelId, toggle: () => setOpen((o) => !o) }),
    [open, panelId],
  );
  return (
    <MosaicClampContext.Provider value={value}>
      {children}
    </MosaicClampContext.Provider>
  );
}

export function MosaicClamp({ children }: { children: ReactNode }) {
  const ctx = useContext(MosaicClampContext);
  // Sans provider : tout est déplié, aucune mesure — cf. en-tête.
  const open = ctx?.open ?? true;
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const links = () => Array.from(box.querySelectorAll("a"));
    const clear = () => {
      for (const a of links()) a.removeAttribute("inert");
    };
    const measureNow = () => {
      if (open || !window.matchMedia(MOBILE_QUERY).matches) {
        clear();
        return;
      }
      for (const a of links()) {
        if (a.offsetTop >= CLAMP_PX - CLAMP_EPSILON) a.setAttribute("inert", "");
        else a.removeAttribute("inert");
      }
    };
    // Les re-mesures ÉVÉNEMENTIELLES passent par rAF : au moment où `resize`
    // ou l'observer tirent, le reflow des lignes n'est pas forcément posé —
    // mesurer une frame plus tard lit l'état final. L'appel INITIAL reste
    // synchrone (l'effet court après layout ; et jsdom ne flushe pas les rAF
    // sous `act`, les tests lisent l'état tout de suite).
    const measure = () => requestAnimationFrame(measureNow);
    measureNow();
    window.addEventListener("resize", measure);
    // L'émulation d'un viewport (devtools, pane de préversion) ne dispatche
    // pas toujours `resize` : l'observer sur la boîte attrape TOUT changement
    // de largeur, quelle qu'en soit la source. Observer AUSSI le paragraphe :
    // la boîte écrêtée a une hauteur figée, seul son enfant bouge quand un
    // swap de fonte rebrasse les retours à la ligne — et `document.fonts.ready`
    // ne suffit pas (résolu AVANT le swap si aucun chargement n'est encore en
    // vol au moment de l'effet). Absent sous jsdom — gardé.
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    if (box.firstElementChild) ro?.observe(box.firstElementChild);
    // Swap de fonte : `fonts.ready` ne suffit pas (résolu AVANT le swap si
    // aucun chargement n'est en vol au moment de l'effet) et le clamp fige
    // les hauteurs observées — `loadingdone` tire lui à CHAQUE fin de
    // chargement réel, quel que soit l'état de `ready`. `document.fonts`
    // absent sous jsdom — gardes optionnelles assumées.
    document.fonts?.ready.then(measure).catch(() => {});
    document.fonts?.addEventListener?.("loadingdone", measure);
    return () => {
      window.removeEventListener("resize", measure);
      document.fonts?.removeEventListener?.("loadingdone", measure);
      ro?.disconnect();
      clear();
    };
  }, [open]);

  return (
    <div
      id={ctx?.panelId}
      ref={boxRef}
      // `relative` : référentiel des `offsetTop` mesurés ci-dessus.
      className={`relative ${open ? "" : "line-clamp-2 sm:line-clamp-none"}`}
    >
      {children}
    </div>
  );
}

/**
 * La flèche de dépliement — posée par l'appelant là où elle doit vivre (la
 * ligne de résultats des pages catalogue), `sm:hidden` d'office : le repli
 * est un régime purement mobile. Le padding large fait la cible tactile ;
 * l'appelant ne fournit que le POSITIONNEMENT via `className`.
 */
export function MosaicClampToggle({ className = "" }: { className?: string }) {
  const ctx = useContext(MosaicClampContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      aria-expanded={ctx.open}
      aria-controls={ctx.panelId}
      aria-label={ctx.open ? "Replier les thèmes" : "Voir tous les thèmes"}
      onClick={ctx.toggle}
      className={`flex items-center justify-center bg-paper px-8 py-2 text-ink transition-colors hover:bg-ink hover:text-paper motion-reduce:transition-none sm:hidden ${FOCUS_RING_LIGHT} ${FOCUS_RING_HOVER_DARK} ${className}`}
    >
      {/* Triangle plein à angles vifs (R8), même recette que le chevron de
          `catalogue-filters.tsx` — Effra ne couvre pas ▾. */}
      <svg
        viewBox="0 0 10 6"
        className={`h-[8px] w-[14px] shrink-0 ${ctx.open ? "rotate-180" : ""}`}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M0 0 L5 6 L10 0 Z" />
      </svg>
    </button>
  );
}
