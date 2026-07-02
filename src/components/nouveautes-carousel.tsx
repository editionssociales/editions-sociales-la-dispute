"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cover } from "@/lib/cover";

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
  startScrollLeft: number;
  moved: boolean;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Ressort doux : dépasse légèrement la cible puis revient (feeling « spring »). */
function easeOutBack(x: number): number {
  const c1 = 1.28;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * Carrousel « spring » des dernières parutions : les couvertures défilent en
 * coverflow — la couverture centrale est zoomée et pleinement opaque, les
 * latérales reculent (échelle, opacité, légère rotation 3D). Chaque couverture
 * est affichée à son ratio réel (hauteur commune, largeur variable) : aucune
 * bande, jamais coupée. Le titre et l'auteur du livre centré s'affichent en
 * légende sous le rail. Les transformations suivent le défilement image par
 * image (aucun re-rendu par pixel) ; la navigation (flèches, fin de glissé,
 * focus clavier) recentre avec un léger ressort.
 */
export function NouveautesCarousel({ books }: { books: NouveauteBook[] }) {
  // Départ centré sur le 2e livre (index 1) : la 1re couverture remplit alors le
  // bord gauche, ce qui évite le grand vide qu'un 1er livre centré y laissait.
  const initialIndex = books.length > 1 ? 1 : 0;
  const trackRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef(0);
  const animRef = useRef(0);
  const activeRef = useRef(initialIndex);
  // Passe à true dès que l'utilisateur pilote le scroll (molette, glissé,
  // flèches, focus). On cesse alors de recentrer automatiquement au chargement
  // des couvertures — sinon ces recentrages contrarient son défilement pendant
  // les ~5 s où les images arrivent.
  const engagedRef = useRef(false);
  const [active, setActive] = useState(initialIndex);

  /** Ajuste les marges de début/fin pour que la 1re et la dernière couverture
   *  (de largeurs variables) puissent se centrer dans le viewport. */
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

  /** Applique échelle / opacité / profondeur à chaque couverture selon sa
   *  distance au centre du viewport, et retient l'indice le plus centré. */
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
      const slide = card.firstElementChild as HTMLElement | null;
      if (slide) {
        slide.style.transform = `perspective(1400px) rotateY(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        slide.style.opacity = opacity.toFixed(3);
        slide.style.zIndex = String(100 - Math.round(t * 10));
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

  /** Anime scrollLeft vers `target` avec un léger ressort (ou saut immédiat en reduced-motion). */
  const springTo = useCallback((target: number) => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const dest = Math.max(0, Math.min(max, target));
    if (animRef.current) cancelAnimationFrame(animRef.current);
    // Le scroll-snap `mandatory` ramène de force scrollLeft sur un point de snap
    // à chaque frame : tant qu'on pilote le scroll en JS il faut le neutraliser,
    // sinon l'animation saute d'un cran à l'autre au lieu de glisser. On le
    // rétablit à la fin — la destination est déjà un point de snap (couverture
    // centrée), donc aucun à-coup au rétablissement.
    if (prefersReducedMotion()) {
      el.style.scrollSnapType = "";
      el.scrollLeft = dest;
      return;
    }
    const start = el.scrollLeft;
    const dist = dest - start;
    if (Math.abs(dist) < 1) {
      el.style.scrollSnapType = "";
      return;
    }
    el.style.scrollSnapType = "none";
    const t0 = performance.now();
    const duration = 560;
    const stepFrame = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      el.scrollLeft = start + dist * easeOutBack(p);
      if (p < 1) {
        animRef.current = requestAnimationFrame(stepFrame);
      } else {
        animRef.current = 0;
        el.style.scrollSnapType = "";
      }
    };
    animRef.current = requestAnimationFrame(stepFrame);
  }, []);

  /** Recentre la couverture d'indice `i` dans le viewport. */
  const centerCard = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      const cards = el.querySelectorAll<HTMLElement>("[data-card]");
      const card = cards[Math.max(0, Math.min(cards.length - 1, i))];
      if (!card) return;
      const rect = el.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      const delta = r.left + r.width / 2 - (rect.left + rect.width / 2);
      springTo(el.scrollLeft + delta);
    },
    [springTo],
  );

  const step = useCallback(
    (dir: -1 | 1) => {
      engagedRef.current = true;
      centerCard(activeRef.current + dir);
    },
    [centerCard],
  );

  // Peinture initiale + marges d'extrémité, puis à chaque défilement / redimensionnement.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    applyEndPadding();
    // Mise en place : on centre d'emblée le livre de départ (2e), par saut direct
    // (sans ressort) pour qu'il n'y ait jamais de vide visible à gauche au chargement.
    const startCards = el.querySelectorAll<HTMLElement>("[data-card]");
    const startCard = startCards[initialIndex];
    if (startCard) {
      const vp = el.getBoundingClientRect();
      const cr = startCard.getBoundingClientRect();
      el.scrollLeft += cr.left + cr.width / 2 - (vp.left + vp.width / 2);
    }
    schedulePaint();
    const onResize = () => {
      applyEndPadding();
      centerCard(activeRef.current);
    };
    // Les couvertures se dimensionnent au ratio réel : leur largeur n'est exacte
    // qu'une fois l'image chargée. On recale alors les marges, et on recentre —
    // MAIS jamais pendant un glissé ni une fois que l'utilisateur a pris la main
    // (engagedRef), pour ne pas contrarier son défilement (capture, car l'event
    // `load` d'une image ne remonte pas).
    const onCoverLoad = () => {
      applyEndPadding();
      if (!dragRef.current && !engagedRef.current) centerCard(activeRef.current);
      schedulePaint();
    };
    // Molette / trackpad : l'utilisateur prend la main. On coupe tout recentrage
    // auto en cours (sinon il lutte contre le scroll) et on rend le snap natif.
    const onWheel = () => {
      engagedRef.current = true;
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = 0;
      }
      el.style.scrollSnapType = "";
    };
    el.addEventListener("scroll", schedulePaint, { passive: true });
    el.addEventListener("load", onCoverLoad, { capture: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", schedulePaint);
      el.removeEventListener("load", onCoverLoad, { capture: true });
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [applyEndPadding, schedulePaint, centerCard, initialIndex]);

  // Glisser-déposer à la souris (le tactile garde son défilement natif + snap).
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = trackRef.current;
    if (!el) return;
    engagedRef.current = true;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    // Snap coupé pendant le glissé souris : `mandatory` happerait scrollLeft à
    // chaque frame et rendrait le glissé saccadé. Rétabli au relâchement.
    el.style.scrollSnapType = "none";
    dragRef.current = { startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false };
    el.style.cursor = "grabbing";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLUListElement>) => {
    const el = trackRef.current;
    const drag = dragRef.current;
    if (!el || !drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 4 && !drag.moved) {
      drag.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = drag.startScrollLeft - dx;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const el = trackRef.current;
      if (el) el.style.cursor = "grab";
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (dragRef.current?.moved) {
        // Fin de glissé : recentre au ressort (springTo rétablit le snap à la fin).
        centerCard(activeRef.current);
      } else if (el) {
        // Survol/clic sans glissé : on rétablit le snap coupé au pointerdown.
        el.style.scrollSnapType = "";
      }
      setTimeout(() => {
        if (dragRef.current) dragRef.current.moved = false;
      }, 0);
    },
    [centerCard],
  );

  // Empêche la navigation si le pointeur vient de glisser (>4px) plutôt que de cliquer.
  const guardClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (dragRef.current?.moved) {
      e.preventDefault();
      dragRef.current.moved = false;
    }
  }, []);

  if (books.length === 0) return null;
  const current = books[Math.min(active, books.length - 1)];

  return (
    <section aria-label="Nouveautés">
      {/* Titre de section sur la même rangée que les flèches (titre à gauche,
          flèches à droite) — même mise en forme que l'ancien en-tête de page. */}
      <div className="mb-[clamp(18px,2.4vw,28px)] flex items-end justify-between gap-4 px-[clamp(16px,4vw,64px)]">
        <div className="min-w-0">
          <p className="font-sans text-xs font-bold uppercase tracking-[.22em] text-black/50">
            Les Éditions sociales × La Dispute
          </p>
          <h1 className="mt-2 font-sans text-[clamp(30px,4.4vw,54px)] font-black italic uppercase leading-[0.94] text-black">
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

      <ul
        ref={trackRef}
        role="list"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="flex cursor-grab items-center gap-[clamp(14px,1.6vw,26px)] overflow-x-auto px-[calc(50%_-_clamp(96px,11vw,132px))] pb-[clamp(20px,3vw,40px)] pt-[clamp(24px,4vw,52px)] [--cover-h:clamp(272px,32vw,392px)] [scroll-snap-type:x_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {books.map((book, i) => (
          <li
            key={book.href}
            data-card
            className="flex-none [scroll-snap-align:center]"
          >
            <Link
              href={book.href}
              onClick={guardClick}
              onFocus={() => {
                engagedRef.current = true;
                centerCard(i);
              }}
              draggable={false}
              aria-label={`${book.title}${book.author ? `, ${book.author}` : ""}`}
              className="block origin-center will-change-transform focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-4"
            >
              {/* Hauteur commune fixée ; la largeur suit le ratio réel de
                  l'image (aucune bande, jamais coupée). draggable=false : le
                  drag HTML5 natif entrerait en conflit avec le glissé du rail. */}
              <div className="relative h-[var(--cover-h)] w-fit bg-paper-2 shadow-[0_14px_34px_rgba(23,20,15,0.16)] ring-1 ring-line">
                <Cover
                  cover={{ url: book.coverUrl, width: book.coverW, height: book.coverH }}
                  alt=""
                  fit="height"
                  sizes="(max-width: 640px) 42vw, 260px"
                  draggable={false}
                  className="block h-full w-auto select-none"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Légende du livre centré — remplace les étiquettes sur les couvertures. */}
      <div
        aria-hidden="true"
        className="mx-auto mt-[clamp(14px,2vw,26px)] min-h-[68px] max-w-[42ch] px-6 text-center"
      >
        {current.upcoming && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocher-text">
            À paraître
          </p>
        )}
        <p className="mt-1 font-serif text-[clamp(19px,2vw,26px)] font-semibold leading-tight text-ink">
          {current.title}
        </p>
        {current.author && (
          <p className="mt-1 text-sm text-muted">{current.author}</p>
        )}
      </div>
    </section>
  );
}
