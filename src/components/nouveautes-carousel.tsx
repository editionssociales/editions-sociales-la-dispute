"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cover } from "@/lib/cover";
import type { NouveauteBook } from "@/lib/nouveaute-book";
import { FOCUS_RING_HOVER_DARK, FOCUS_RING_LIGHT } from "@/lib/ui";

export type { NouveauteBook };

interface DragState {
  startX: number;
  startScroll: number;
  moved: boolean;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Carrousel des dernières parutions.
 *
 * DÉFILEMENT NATIF : le rail est un conteneur `overflow-x` classique. Le
 * mouvement (roue libre à la molette / trackpad / tactile, inertie) reste géré
 * par le navigateur sur le thread compositeur — donc fluide même quand le thread
 * principal peint l'effet — et les gestes natifs marchent sans cliquer. On
 * n'utilise PAS `scroll-snap: mandatory` (qui, en se battant contre tout
 * repositionnement, provoquait flash de limite et jitter de fin) : seulement
 * `proximity`, qui suggère un recentrage doux au repos sans jamais happer le
 * défilement. Pas de boucle infinie : catalogue affiché une seule fois (DOM
 * léger, toutes les cartes réelles et focusables).
 *
 * PROFONDEUR (épure minimaliste — la perspective 3D/rotation a été retirée) :
 * par-dessus, on applique image par image une échelle + opacité + z-index à
 * chaque couverture selon la distance de sa carte au centre du viewport — la
 * centrale zoomée et opaque, les latérales reculent et s'estompent, sans
 * aucune rotation ni perspective. On mesure le `<li>` (jamais mis à l'échelle →
 * mesure stable) et on applique la transform à son enfant interne, sur
 * l'événement `scroll` (throttlé en rAF). Couvertures au ratio réel (hauteur
 * commune, largeur variable) ; marges d'extrémité ajustées pour centrer la
 * 1re / la dernière.
 *
 * COUVERTURES SEULES (retour client 2026-07-23) : plus aucune légende
 * titre/auteur/date sous le rail — le titre et l'auteur restent portés par
 * l'`aria-label` de chaque lien. Flèches et sortie « Tout le catalogue »
 * sont désactivables par prop (la vitrine les masque, la vue « à paraître »
 * garde les flèches).
 */
export function NouveautesCarousel({
  books,
  showArrows = true,
  showCatalogueLink = true,
}: {
  books: NouveauteBook[];
  showArrows?: boolean;
  showCatalogueLink?: boolean;
}) {
  const n = books.length;

  const trackRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // Le `click` suit le `pointerup` : on mémorise ici « le geste précédent était
  // un drag » pour annuler la navigation, sans garder `dragRef` en vie (ce qui
  // faisait coller le rail à la souris au survol suivant).
  const suppressClickRef = useRef(false);
  const rafRef = useRef(0);
  const activeRef = useRef(0);
  // Dernier z-index appliqué par carte : on n'écrit le z-index que lorsqu'il
  // change (le changer à chaque frame force un recalcul d'empilement inutile).
  const zRef = useRef<number[]>([]);
  // Index actif ET butées, en ÉTAT (contrairement au reste, en refs) : ils
  // pilotent du rendu React — l'annonce assistive (#86) et la désactivation
  // des flèches en butée (#91, même geste que `pagination.tsx`). `setState`
  // fonctionnel, comparé à la valeur précédente : `paint()` tourne à chaque
  // frame de défilement, mais ne déclenche un rendu que quand la valeur
  // affichée change réellement (#90).
  const [activeIndex, setActiveIndex] = useState(n > 1 ? 1 : 0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(n <= 1);

  /** Ajuste les marges de début/fin pour que la 1re et la dernière couverture
   *  (largeurs variables) puissent se centrer dans le viewport. */
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

  /** Applique l'échelle/opacité/z-index à chaque couverture selon la distance
   *  de sa carte au centre du viewport, et retient l'indice le plus centré
   *  (cible des flèches). */
  const paint = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-card]");
    if (cards.length === 0) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;

    // Pas de référence entre deux couvertures voisines (largeurs variables).
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
    });

    activeRef.current = nearest;
    setActiveIndex((prev) => (prev === nearest ? prev : nearest));
    setAtStart((prev) => (prev === (nearest <= 0) ? prev : nearest <= 0));
    setAtEnd((prev) => {
      const next = nearest >= cards.length - 1;
      return prev === next ? prev : next;
    });
  }, []);

  const schedulePaint = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paint();
    });
  }, [paint]);

  /** Recentre la couverture d'indice `i` (défilement natif lisse, ou instantané
   *  si `instant` — montage initial, toujours compatible prefers-reduced-motion
   *  puisqu'il n'anime de toute façon jamais). */
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

  // Peinture initiale + marges d'extrémité, puis à chaque défilement / resize /
  // chargement de couverture (leur largeur n'est exacte qu'une fois l'image
  // arrivée — capture, car l'event `load` d'une image ne remonte pas). Le
  // montage centre directement le 2e livre (repli sur le 1er s'il y en a
  // moins de deux) — `instant`, jamais d'animation au chargement (compatible
  // prefers-reduced-motion de fait, puisque rien n'anime dans les deux cas).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    applyEndPadding();
    const initialIndex = n > 1 ? 1 : 0;
    activeRef.current = initialIndex;
    centerCard(initialIndex, true);
    schedulePaint();
    const onResize = () => {
      applyEndPadding();
      centerCard(activeRef.current);
    };
    const onCoverLoad = () => {
      applyEndPadding();
      schedulePaint();
    };
    el.addEventListener("scroll", schedulePaint, { passive: true });
    el.addEventListener("load", onCoverLoad, { capture: true });
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", schedulePaint);
      el.removeEventListener("load", onCoverLoad, { capture: true });
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [applyEndPadding, schedulePaint, centerCard, n]);

  // Glisser-déposer à la souris (grab) : le trackpad / tactile / molette gardent
  // leur défilement natif. On coupe le snap le temps du glissé (proximity ne
  // happerait pas, mais on évite toute suggestion pendant qu'on tient).
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
    // Sécurité : plus aucun bouton pressé ⇒ le `pointerup` a été manqué (relâché
    // hors fenêtre / hors élément sans capture). On termine le drag ici, sinon
    // `dragRef` survivrait et le rail « collerait » à la souris au survol.
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

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLUListElement>) => {
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
      // Le geste était un drag : on annule le `click` de navigation qui suit
      // (via un flag dédié, lu par guardClick), puis on recentre.
      suppressClickRef.current = true;
      centerCard(activeRef.current);
    }
    // On relâche la référence de drag. Sans ça, `onPointerMove` (qui se déclenche
    // aussi au simple survol souris, bouton relâché) continuait à scroller depuis
    // `startScroll`/`startX` figés au clic précédent → le rail « collait » à la
    // souris avec saut instantané. dragRef null ⇒ le prochain move sort aussitôt.
    dragRef.current = null;
  }, [centerCard]);

  // Empêche la navigation si le pointeur vient de glisser plutôt que de cliquer.
  const guardClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      suppressClickRef.current = false;
    }
  }, []);

  // Rail mémoïsé : jamais re-rendu par les re-renders du parent (le rail
  // d'images ne doit pas se reconcilier pendant un défilement → saccades).
  const rail = useMemo(
    () => (
      <ul
        ref={trackRef}
        role="list"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDragStart={(e) => e.preventDefault()}
        className="flex cursor-grab select-none items-center gap-[clamp(14px,1.6vw,26px)] overflow-x-auto px-[calc(50%_-_clamp(96px,11vw,132px))] pb-[clamp(20px,3vw,40px)] pt-[clamp(24px,4vw,52px)] [--cover-h:clamp(200px,32vw,392px)] [scroll-snap-type:x_proximity] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {books.map((book, i) => (
          <li key={book.href} data-card className="flex-none [scroll-snap-align:center]">
            <Link
              href={book.href}
              onClick={guardClick}
              onFocus={() => centerCard(i)}
              draggable={false}
              aria-label={`${book.title}${book.author ? `, ${book.author}` : ""}`}
              className={`block origin-center will-change-transform ${FOCUS_RING_LIGHT}`}
            >
              {/* Hauteur commune fixée ; la largeur suit le ratio réel de
                  l'image (aucune bande, jamais coupée). draggable=false : le
                  drag HTML5 natif entrerait en conflit avec le glissé du rail.
                  1re couverture : preload (LCP) — les suivantes restent lazy. */}
              <div className="relative h-[var(--cover-h)] w-fit bg-paper-2 shadow-[8px_8px_0_0_var(--color-ink)] ring-1 ring-ink">
                <Cover
                  cover={{ url: book.coverUrl, width: book.coverW, height: book.coverH }}
                  alt={book.title}
                  fit="height"
                  sizes="(max-width: 640px) 42vw, 260px"
                  preload={i === 0}
                  draggable={false}
                  className="block h-full w-auto select-none"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    ),
    [books, guardClick, centerCard, onPointerDown, onPointerMove, onPointerUp],
  );

  if (n === 0) return null;

  return (
    <section aria-label="Nouveautés" className="relative">
      {/* Épure minimaliste : plus de titre de section ni de rangée dédiée —
          flèches et sortie catalogue (quand demandées) sont SUPERPOSÉES au
          cadre du carrousel, coin supérieur droit (z au-dessus des cartes,
          dont le z-index peint monte à 100) : les couvertures rétrécissent
          près des bords, le coin reste visuellement libre. Aucun espace
          vertical réservé. */}
      {(showArrows || showCatalogueLink) && (
        <div className="absolute right-[clamp(16px,4vw,64px)] top-0 z-[120] flex items-end justify-end gap-4">
          <div className="flex flex-none flex-col items-end gap-1">
            {showArrows && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Couverture précédente"
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
                  aria-label="Couverture suivante"
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
                {/* Annonce assistive du déplacement (#86) : les flèches ne
                    produisaient aucun retour pour les technologies
                    d'assistance — région live, hors du flux visuel. */}
                <p aria-live="polite" className="sr-only">
                  {books[activeIndex]
                    ? `${activeIndex + 1} sur ${n} : ${books[activeIndex].title}`
                    : ""}
                </p>
              </div>
            )}
            {/* Sortie discrète du carrousel, à proximité des flèches — même
                patron que les liens secondaires existants (`min-h-11`, anneau
                de focus, soulignement sobre ; ex. « Retirer » du panier). */}
            {showCatalogueLink && (
              <Link
                href="/catalogue"
                className={`inline-flex min-h-11 items-center gap-1 px-2 -mx-2 font-sans text-xs font-bold uppercase tracking-[.04em] text-ink-soft underline decoration-1 underline-offset-2 hover:text-ink ${FOCUS_RING_LIGHT}`}
              >
                Tout le catalogue <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {rail}
    </section>
  );
}
