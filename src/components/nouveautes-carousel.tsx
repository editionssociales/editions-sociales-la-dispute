"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cover } from "@/lib/cover";
import { Eyebrow } from "@/components/eyebrow";

/** Un livre déjà mis en forme par la page serveur — aucune fonction, uniquement des données sérialisables. */
export interface NouveauteBook {
  href: string;
  title: string;
  author: string;
  coverUrl: string;
  coverW: number;
  coverH: number;
  upcoming: boolean;
  imprint: string;
}

interface DragState {
  startX: number;
  startScroll: number;
  moved: boolean;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Carrousel « coverflow » des dernières parutions.
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
 * EFFET 3D : par-dessus, on applique image par image une transform coverflow
 * (échelle + opacité + rotation 3D) à chaque couverture selon la distance de sa
 * carte au centre du viewport — la centrale zoomée et opaque, les latérales
 * reculent et s'inclinent. On mesure le `<li>` (jamais mis à l'échelle → mesure
 * stable) et on applique la transform à son enfant interne, sur l'événement
 * `scroll` (throttlé en rAF). Le rail est mémoïsé : changer la légende ne re-rend
 * jamais les images. Couvertures au ratio réel (hauteur commune, largeur
 * variable) ; marges d'extrémité ajustées pour centrer la 1re / la dernière.
 */
export function NouveautesCarousel({ books }: { books: NouveauteBook[] }) {
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
  const [active, setActive] = useState(0);

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

  /** Applique la transform coverflow à chaque couverture selon la distance de sa
   *  carte au centre du viewport, et retient l'indice le plus centré (légende). */
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
      const norm = Math.max(-1.4, Math.min(1.4, d / pitch));
      const scale = Math.max(0.72, 1.12 - 0.3 * t);
      const opacity = Math.max(0.32, 1 - 0.42 * t);
      const rotate = -norm * 13; // rotation 3D douce, côté opposé au centre
      const z = 100 - Math.round(t * 10);
      const inner = card.firstElementChild as HTMLElement | null;
      if (inner) {
        inner.style.transform = `perspective(1400px) rotateY(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        inner.style.opacity = opacity.toFixed(3);
        if (zRef.current[i] !== z) {
          inner.style.zIndex = String(z);
          zRef.current[i] = z;
        }
      }
    });

    if (nearest !== activeRef.current) {
      activeRef.current = nearest;
      setActive(nearest);
    }
  }, []);

  const schedulePaint = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paint();
    });
  }, [paint]);

  /** Recentre la couverture d'indice `i` (défilement natif lisse). */
  const centerCard = useCallback((i: number) => {
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
      behavior: prefersReducedMotion() ? "auto" : "smooth",
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
  // arrivée — capture, car l'event `load` d'une image ne remonte pas).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    applyEndPadding();
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
  }, [applyEndPadding, schedulePaint, centerCard]);

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

  // Rail mémoïsé : indépendant de `active`, jamais re-rendu quand la légende
  // change (sinon tout le rail d'images se reconcilierait à chaque carte
  // franchie pendant un défilement → saccades).
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
        className="flex cursor-grab select-none items-center gap-[clamp(14px,1.6vw,26px)] overflow-x-auto px-[calc(50%_-_clamp(96px,11vw,132px))] pb-[clamp(20px,3vw,40px)] pt-[clamp(24px,4vw,52px)] [--cover-h:clamp(272px,32vw,392px)] [scroll-snap-type:x_proximity] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {books.map((book, i) => (
          <li key={book.href} data-card className="flex-none [scroll-snap-align:center]">
            <Link
              href={book.href}
              onClick={guardClick}
              onFocus={() => centerCard(i)}
              draggable={false}
              aria-label={`${book.title}${book.author ? `, ${book.author}` : ""}`}
              className="block origin-center will-change-transform focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-4"
            >
              {/* Hauteur commune fixée ; la largeur suit le ratio réel de
                  l'image (aucune bande, jamais coupée). draggable=false : le
                  drag HTML5 natif entrerait en conflit avec le glissé du rail.
                  1re couverture : preload (LCP) — les suivantes restent lazy. */}
              <div className="relative h-[var(--cover-h)] w-fit bg-paper-2 shadow-[8px_8px_0_0_#17140f] ring-1 ring-ink">
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
  const current = books[((active % n) + n) % n];

  return (
    <section aria-label="Nouveautés">
      {/* Titre de section sur la même rangée que les flèches (titre à gauche,
          flèches à droite) — même mise en forme que l'ancien en-tête de page. */}
      <div className="mb-[clamp(18px,2.4vw,28px)] flex items-end justify-between gap-4 px-[clamp(16px,4vw,64px)]">
        <div className="min-w-0">
          <Eyebrow>
            Les Éditions sociales × La Dispute
          </Eyebrow>
          <h1 className="mt-2 font-sans text-[clamp(30px,4.4vw,54px)] font-black italic uppercase leading-[0.98] text-ink">
            Nouveautés
          </h1>
        </div>
        <div className="flex flex-none gap-2">
          <button
            type="button"
            aria-label="Couverture précédente"
            onClick={() => step(-1)}
            className="flex h-[clamp(44px,4vw,52px)] w-[clamp(44px,4vw,52px)] items-center justify-center border-[1.5px] border-ink bg-paper text-xl text-ink transition-colors hover:bg-ink hover:text-paper focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-2 motion-reduce:transition-none"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Couverture suivante"
            onClick={() => step(1)}
            className="flex h-[clamp(44px,4vw,52px)] w-[clamp(44px,4vw,52px)] items-center justify-center border-[1.5px] border-ink bg-paper text-xl text-ink transition-colors hover:bg-ink hover:text-paper focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-2 motion-reduce:transition-none"
          >
            →
          </button>
        </div>
      </div>

      {rail}

      {/* Légende du livre centré — remplace les étiquettes sur les couvertures.
          aria-live pour les lecteurs d'écran quand la carte active change. */}
      <div
        aria-live="polite"
        className="mx-auto mt-[clamp(14px,2vw,26px)] min-h-[68px] max-w-[42ch] px-6 text-center"
      >
        {current.upcoming && (
          <span className="inline-flex border-b-2 border-r-2 border-ink bg-pop-orange px-2 py-0.5 font-sans text-[10px] font-extrabold uppercase tracking-[.05em] text-black">
            À paraître
          </span>
        )}
        <p className="mt-1 font-serif text-[clamp(19px,2vw,26px)] font-semibold leading-tight text-ink">
          {current.title}
        </p>
        {current.author && (
          <p className="mt-1 text-sm text-ink-soft">{current.author}</p>
        )}
      </div>
    </section>
  );
}
