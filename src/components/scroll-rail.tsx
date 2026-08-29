"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FOCUS_RING_HOVER_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";

/**
 * Primitive de présentation générique du rail à défilement (extraction du
 * carrousel des nouveautés, lot D3 — cf. `nouveautes-carousel.tsx`, désormais
 * un adaptateur mince par-dessus). Ne connaît RIEN du contenu des cartes :
 * une liste `{ key, node, label? }`, deux comportements optionnels (flèches,
 * effet de profondeur), et c'est tout — DOM/comportement du rail des
 * nouveautés inchangés à l'octet (verrouillé par
 * `nouveautes-carousel-lcp.test.ts`, qui grep le SOURCE de l'adaptateur).
 *
 * DÉFILEMENT NATIF (même parti pris que l'ex-carrousel unique) : le rail est
 * un `overflow-x-auto` classique, la molette/trackpad/tactile restent gérés
 * par le navigateur ; `scroll-snap-type: x proximity` (jamais `mandatory`,
 * qui provoquait flash de limite et jitter de fin) suggère un recentrage doux
 * sans jamais happer le défilement.
 *
 * COMPORTEMENT PAR CARTE, posé par DÉLÉGATION D'ÉVÉNEMENT sur le `<ul>` —
 * jamais par clonage de `item.node` (un `onClick`/`onFocus` injecté via
 * `cloneElement`, fermé sur les refs internes du rail, se lit comme « lire
 * une ref pendant le rendu » pour l'analyse statique de React Compiler,
 * `react-hooks/refs` — constat lors de l'extraction) : suppression du clic
 * qui suit un drag (`onClickCapture`) et recentrage au focus clavier (Tab,
 * `onFocus`, qui BULLE nativement — délégation sans capture) sont posés UNE
 * fois ici, sur le conteneur, pour tous les rails du site. L'appelant garde
 * l'entière responsabilité de son `item.node` (ex. `draggable={false}` sur
 * son propre lien — le rail ne le force plus).
 */

export interface ScrollRailItem {
  /** Clé React ET ancre de l'item — doit être stable et unique. */
  key: string;
  /** Élément rendu dans la carte — Link, div… */
  node: ReactNode;
  /** Libellé lu par l'annonce assistive des flèches quand cette carte devient active. Omis : l'annonce ne précise que le rang. */
  label?: string;
}

interface DragState {
  startX: number;
  startScroll: number;
  moved: boolean;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface ScrollRailProps {
  items: ScrollRailItem[];
  /** `id` DOM du rail (`<ul>`) — un seul appelant du site en pose un (bootstrap LCP des nouveautés), sinon omis. */
  railId?: string;
  /** `aria-label` de la `<section>` englobante (landmark). */
  ariaLabel: string;
  /** Classes LITTÉRALES du rail (`<ul>`, contrat JIT) — espacement/padding/`overflow-x-auto`/snap propres à l'appelant, le primitive n'en impose aucune. */
  trackClassName: string;
  /** Classes LITTÉRALES de chaque carte (`<li data-card>`). */
  itemClassName: string;
  /** Carte centrée au premier paint (0 par défaut). */
  initialIndex?: number;
  /** Effet de profondeur (échelle/opacité/z-index selon la distance au centre de chaque carte) — désactivé par défaut. */
  depthEffect?: boolean;
  /** Flèches précédent/suivant, superposées en haut à droite du rail. */
  showArrows?: boolean;
  /** `aria-label` de la flèche précédente (générique par défaut). */
  prevAriaLabel?: string;
  /** `aria-label` de la flèche suivante (générique par défaut). */
  nextAriaLabel?: string;
  /** Contenu additionnel posé dans le même coin que les flèches, sous elles (ex. lien « Tout le catalogue »). */
  cornerExtra?: ReactNode;
  /** Rendu juste après le rail, à l'intérieur de la `<section>` — seul usage : le script de bootstrap LCP des nouveautés, qui doit suivre le `<ul>` dans le flux HTML. */
  afterTrack?: ReactNode;
}

export function ScrollRail({
  items,
  railId,
  ariaLabel,
  trackClassName,
  itemClassName,
  initialIndex = 0,
  depthEffect = false,
  showArrows = false,
  prevAriaLabel = "Précédent",
  nextAriaLabel = "Suivant",
  cornerExtra,
  afterTrack,
}: ScrollRailProps) {
  const n = items.length;

  const trackRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // Le `click` suit le `pointerup` : on mémorise ici « le geste précédent
  // était un drag » pour annuler la navigation, sans garder `dragRef` en vie.
  const suppressClickRef = useRef(false);
  const rafRef = useRef(0);
  const activeRef = useRef(0);
  // Dernier z-index appliqué par carte (effet de profondeur) : on n'écrit le
  // z-index que lorsqu'il change.
  const zRef = useRef<number[]>([]);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(n <= 1);

  /** Ajuste les marges de début/fin pour que la 1re et la dernière carte (largeurs variables) puissent se centrer dans le viewport. */
  const applyEndPadding = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-card]");
    if (cards.length === 0) return;
    const cw = el.clientWidth;
    const first = cards[0].getBoundingClientRect().width;
    const last = cards[cards.length - 1].getBoundingClientRect().width;
    el.style.paddingLeft = `${Math.max(16, (cw - first) / 2)}px`;
    el.style.paddingRight = `${Math.max(16, (cw - last) / 2)}px`;
  }, []);

  /** Repère la carte la plus centrée (pour les flèches/l'annonce) et, en option, y applique l'effet de profondeur. */
  const paint = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-card]");
    if (cards.length === 0) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;

    let pitch = cards[0].getBoundingClientRect().width;
    if (cards.length > 1) {
      const a = cards[0].getBoundingClientRect();
      const b = cards[1].getBoundingClientRect();
      pitch = Math.abs(b.left + b.width / 2 - (a.left + a.width / 2)) || pitch;
    }

    let nearest = 0;
    let nearestDist = Infinity;
    cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const d = r.left + r.width / 2 - centerX; // px, signé
      const abs = Math.abs(d);
      if (abs < nearestDist) {
        nearestDist = abs;
        nearest = i;
      }
      if (depthEffect) {
        const t = Math.min(abs / pitch, 2.4); // distance normalisée
        const scale = Math.max(0.72, 1.12 - 0.3 * t);
        const opacity = Math.max(0.32, 1 - 0.42 * t);
        const z = 100 - Math.round(t * 10);
        const inner = card.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.transform = `scale(${scale.toFixed(3)})`;
          inner.style.opacity = opacity.toFixed(3);
          if (zRef.current[i] !== z) {
            inner.style.zIndex = String(z);
            zRef.current[i] = z;
          }
        }
      }
    });

    activeRef.current = nearest;
    setActiveIndex((prev) => (prev === nearest ? prev : nearest));
    setAtStart((prev) => (prev === (nearest <= 0) ? prev : nearest <= 0));
    setAtEnd((prev) => {
      const next = nearest >= cards.length - 1;
      return prev === next ? prev : next;
    });
  }, [depthEffect]);

  const schedulePaint = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paint();
    });
  }, [paint]);

  /** Recentre la carte d'indice `i` (défilement natif lisse, ou instantané si `instant`). */
  const centerCard = useCallback((i: number, instant = false) => {
    const el = trackRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-card]");
    const card = cards[Math.max(0, Math.min(cards.length - 1, i))];
    if (!card) return;
    const rect = el.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const delta = r.left + r.width / 2 - (rect.left + rect.width / 2);
    el.scrollTo({
      left: el.scrollLeft + delta,
      behavior: instant || prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

  const step = useCallback(
    (dir: -1 | 1) => {
      centerCard(activeRef.current + dir);
    },
    [centerCard],
  );

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    applyEndPadding();
    activeRef.current = initialIndex;
    centerCard(initialIndex, true);
    schedulePaint();
    const onResize = () => {
      applyEndPadding();
      centerCard(activeRef.current);
    };
    const onCardLoad = () => {
      applyEndPadding();
      schedulePaint();
    };
    el.addEventListener("scroll", schedulePaint, { passive: true });
    // `capture: true` : l'event `load` d'une image ne remonte pas (ne bulle
    // pas) — seule la capture l'intercepte depuis le rail.
    el.addEventListener("load", onCardLoad, { capture: true });
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", schedulePaint);
      el.removeEventListener("load", onCardLoad, { capture: true });
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [applyEndPadding, schedulePaint, centerCard, initialIndex]);

  // Glisser-déposer à la souris (grab) : le trackpad / tactile / molette
  // gardent leur défilement natif.
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = trackRef.current;
    if (!el) return;
    el.style.scrollSnapType = "none";
    dragRef.current = { startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    el.style.cursor = "grabbing";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLUListElement>) => {
    const el = trackRef.current;
    const drag = dragRef.current;
    if (!el || !drag) return;
    // Sécurité : plus aucun bouton pressé ⇒ le `pointerup` a été manqué.
    if (e.buttons === 0) {
      dragRef.current = null;
      el.style.cursor = "grab";
      el.style.scrollSnapType = "";
      return;
    }
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 4 && !drag.moved) {
      drag.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = drag.startScroll - dx;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const el = trackRef.current;
      const drag = dragRef.current;
      if (el) {
        el.style.cursor = "grab";
        el.style.scrollSnapType = "";
      }
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (drag?.moved) {
        suppressClickRef.current = true;
        centerCard(activeRef.current);
      }
      dragRef.current = null;
    },
    [centerCard],
  );

  // Suppression du clic qui suit un drag — délégué sur le `<ul>` en phase de
  // capture (avant que le lien cliqué ne traite son propre `click`), plutôt
  // que posé sur chaque carte : `preventDefault()` annule la navigation quel
  // que soit l'élément qui a reçu l'événement.
  const onTrackClickCapture = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      suppressClickRef.current = false;
    }
  }, []);

  // Recentrage au focus clavier (Tab) — délégué de la même façon : l'event
  // `focus` React BULLE (implémenté sur `focusin`), un seul écouteur sur le
  // `<ul>` suffit à repérer la carte focalisée (`closest("[data-card]")`) et
  // à la centrer, sans qu'aucune carte n'ait besoin d'un handler dédié.
  const onTrackFocus = useCallback(
    (e: React.FocusEvent<HTMLUListElement>) => {
      const el = trackRef.current;
      const card = (e.target as HTMLElement).closest<HTMLElement>("[data-card]");
      if (!el || !card) return;
      const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-card]"));
      const i = cards.indexOf(card);
      if (i >= 0) centerCard(i);
    },
    [centerCard],
  );

  // Cartes mémoïsées : jamais reconciliées par les re-renders déclenchés par
  // le défilement (activeIndex/atStart/atEnd) — seule la référence d'`items`
  // les invalide.
  const renderedItems = useMemo(
    () =>
      items.map((item) => (
        <li key={item.key} data-card className={itemClassName}>
          {item.node}
        </li>
      )),
    [items, itemClassName],
  );

  if (n === 0) return null;

  return (
    <section aria-label={ariaLabel} className="relative">
      {(showArrows || cornerExtra) && (
        <div className="absolute right-[clamp(16px,4vw,64px)] top-0 z-[120] flex items-end justify-end gap-4">
          <div className="flex flex-none flex-col items-end gap-1">
            {showArrows && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={prevAriaLabel}
                  disabled={atStart}
                  onClick={() => step(-1)}
                  className={`flex h-[clamp(44px,4vw,52px)] w-[clamp(44px,4vw,52px)] items-center justify-center border-[1.5px] border-ink bg-paper text-xl text-ink transition-colors motion-reduce:transition-none ${FOCUS_RING_LIGHT} ${
                    atStart
                      ? "pointer-events-none text-ink/30"
                      : `hover:bg-ink hover:text-paper ${FOCUS_RING_HOVER_DARK}`
                  }`}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label={nextAriaLabel}
                  disabled={atEnd}
                  onClick={() => step(1)}
                  className={`flex h-[clamp(44px,4vw,52px)] w-[clamp(44px,4vw,52px)] items-center justify-center border-[1.5px] border-ink bg-paper text-xl text-ink transition-colors motion-reduce:transition-none ${FOCUS_RING_LIGHT} ${
                    atEnd
                      ? "pointer-events-none text-ink/30"
                      : `hover:bg-ink hover:text-paper ${FOCUS_RING_HOVER_DARK}`
                  }`}
                >
                  →
                </button>
                {/* Annonce assistive du déplacement — région live, hors du flux visuel. */}
                <p aria-live="polite" className="sr-only">
                  {items[activeIndex]
                    ? `${activeIndex + 1} sur ${n}${
                        items[activeIndex].label ? ` : ${items[activeIndex].label}` : ""
                      }`
                    : ""}
                </p>
              </div>
            )}
            {cornerExtra}
          </div>
        </div>
      )}

      <ul
        ref={trackRef}
        id={railId}
        // Un éventuel script de bootstrap (LCP) pose padding/scroll avant
        // hydratation : ces attributs ne sont pas dans le VDOM React.
        suppressHydrationWarning
        role="list"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={onTrackClickCapture}
        onFocus={onTrackFocus}
        className={trackClassName}
      >
        {renderedItems}
      </ul>
      {afterTrack}
    </section>
  );
}
