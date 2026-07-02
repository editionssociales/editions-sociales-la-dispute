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
 *
 * BOUCLE INFINIE : le catalogue est répété en plusieurs copies ; dès que la
 * couverture centrée quitte la copie « canonique » (centrale), on ramène
 * scrollLeft dans cette copie par saut d'un pas entier — le contenu étant
 * identique, le saut est invisible. On défile donc sans fin, sans jamais de
 * vide à gauche ni à droite. Seule la copie centrale est exposée au clavier et
 * aux lecteurs d'écran (les autres sont `aria-hidden` / non focusables).
 */
export function NouveautesCarousel({ books }: { books: NouveauteBook[] }) {
  const n = books.length;
  // On ne boucle qu'à partir de deux livres (un seul : rien à faire tourner).
  const LOOP = n > 1;
  // Assez de copies pour garnir le viewport de part et d'autre du centre, même
  // avec peu de livres (≈ 12 cartes minimum au total).
  const COPIES = LOOP ? Math.max(3, Math.ceil(12 / n)) : 1;
  const MIDDLE = Math.floor(COPIES / 2); // copie « canonique » (centrale)
  const middleStart = MIDDLE * n; // indice de sa 1re carte dans le rail cloné
  // Carte centrée au départ : la 1re de la copie centrale — ses voisines de
  // gauche (fin de la copie précédente) remplissent d'emblée le bord gauche.
  const startIndex = LOOP ? middleStart : 0;

  const trackRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef(0);
  const animRef = useRef(0);
  const activeRef = useRef(startIndex);
  // Pas de la boucle (px) : distance entre une carte et son homologue de la
  // copie suivante. Mesurée après mise en page (largeurs = ratios réels).
  const setAdvanceRef = useRef(0);
  // Passe à true dès que l'utilisateur pilote le scroll (molette, glissé,
  // flèches, focus). On cesse alors de recentrer automatiquement au chargement
  // des couvertures — sinon ces recentrages contrarient son défilement pendant
  // les ~5 s où les images arrivent.
  const engagedRef = useRef(false);
  const [active, setActive] = useState(startIndex);

  /** Ajuste les marges de début/fin pour que la 1re et la dernière couverture
   *  (de largeurs variables) puissent se centrer dans le viewport. Inutile en
   *  mode boucle (il y a toujours du contenu de part et d'autre). */
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

  /** Mesure le pas de la boucle : écart de centre entre la carte 0 et son
   *  homologue de la copie suivante (carte n). Robuste aux largeurs variables. */
  const measureAdvance = useCallback(() => {
    const el = trackRef.current;
    if (!el || !LOOP) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-card]");
    if (cards.length <= n) return;
    const a = cards[0].getBoundingClientRect();
    const b = cards[n].getBoundingClientRect();
    const adv = b.left + b.width / 2 - (a.left + a.width / 2);
    if (adv > 0) setAdvanceRef.current = adv;
  }, [LOOP, n]);

  /** Cœur de la boucle : si la carte centrée sort de la copie centrale, on
   *  ramène scrollLeft dans cette copie par sauts d'un pas entier (contenu
   *  identique → saut invisible). On s'abstient pendant une animation/un glissé
   *  et quand le focus clavier vit dans le rail (il reste en copie centrale, en
   *  bande — un saut l'écarterait visuellement du centre). */
  const maybeWrap = useCallback(() => {
    const el = trackRef.current;
    if (!el || !LOOP) return;
    if (animRef.current || dragRef.current) return;
    if (typeof document !== "undefined" && el.contains(document.activeElement)) return;
    const advance = setAdvanceRef.current;
    if (!advance) return;
    let a = activeRef.current;
    let shifted = false;
    // Toujours ramener vers le centre : ces sauts éloignent des bords, jamais
    // au-delà — pas de dépassement de scrollLeft à gérer.
    while (a < middleStart) {
      el.scrollLeft += advance;
      a += n;
      shifted = true;
    }
    while (a >= middleStart + n) {
      el.scrollLeft -= advance;
      a -= n;
      shifted = true;
    }
    if (shifted) activeRef.current = a;
  }, [LOOP, n, middleStart]);

  /** Applique échelle / opacité / profondeur à chaque couverture selon sa
   *  distance au centre du viewport, retient l'indice le plus centré, puis
   *  recale la boucle. */
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

    if (LOOP) maybeWrap();
  }, [LOOP, maybeWrap]);

  const schedulePaint = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paint();
    });
  }, [paint]);

  /** Anime scrollLeft vers `target` avec un léger ressort (ou saut immédiat en reduced-motion). */
  const springTo = useCallback(
    (target: number) => {
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
          maybeWrap();
        }
      };
      animRef.current = requestAnimationFrame(stepFrame);
    },
    [maybeWrap],
  );

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
    if (LOOP) measureAdvance();
    else applyEndPadding();
    // Mise en place : on centre d'emblée la carte de départ (1re de la copie
    // centrale, en boucle) par saut direct (sans ressort) — jamais de vide
    // visible à gauche au chargement.
    const startCards = el.querySelectorAll<HTMLElement>("[data-card]");
    const startCard = startCards[startIndex];
    if (startCard) {
      const vp = el.getBoundingClientRect();
      const cr = startCard.getBoundingClientRect();
      el.scrollLeft += cr.left + cr.width / 2 - (vp.left + vp.width / 2);
    }
    schedulePaint();
    const onResize = () => {
      if (LOOP) measureAdvance();
      else applyEndPadding();
      centerCard(activeRef.current);
    };
    // Les couvertures se dimensionnent au ratio réel : leur largeur n'est exacte
    // qu'une fois l'image chargée. On recale alors le pas / les marges, et on
    // recentre — MAIS jamais pendant un glissé ni une fois que l'utilisateur a
    // pris la main (engagedRef), pour ne pas contrarier son défilement (capture,
    // car l'event `load` d'une image ne remonte pas).
    const onCoverLoad = () => {
      if (LOOP) measureAdvance();
      else applyEndPadding();
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
  }, [
    LOOP,
    startIndex,
    applyEndPadding,
    measureAdvance,
    schedulePaint,
    centerCard,
  ]);

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

  if (n === 0) return null;
  const current = books[((active % n) + n) % n];
  // Rail cloné (copie-major, livre-mineur) : l'indice global d'une carte vaut
  // `copie * n + livre`, ce qui suit l'ordre du DOM (donc de querySelectorAll).
  const slides = Array.from({ length: COPIES }, (_, copy) =>
    books.map((book, real) => ({ book, copy, real })),
  ).flat();

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
        className={`flex cursor-grab items-center gap-[clamp(14px,1.6vw,26px)] overflow-x-auto pb-[clamp(20px,3vw,40px)] pt-[clamp(24px,4vw,52px)] [--cover-h:clamp(272px,32vw,392px)] [scroll-snap-type:x_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          // En boucle, aucun padding d'extrémité : les copies voisines
          // garnissent les bords. Sinon, on centre le 1er/dernier livre.
          LOOP ? "px-0" : "px-[calc(50%_-_clamp(96px,11vw,132px))]"
        }`}
      >
        {slides.map(({ book, copy, real }) => {
          const gi = copy * n + real; // indice global dans le rail
          const primary = !LOOP || copy === MIDDLE; // seule copie exposée à l'AT/clavier
          return (
            <li
              key={`${book.href}#${copy}`}
              data-card
              aria-hidden={primary ? undefined : true}
              className="flex-none [scroll-snap-align:center]"
            >
              <Link
                href={book.href}
                onClick={guardClick}
                onFocus={
                  primary
                    ? () => {
                        engagedRef.current = true;
                        centerCard(gi);
                      }
                    : undefined
                }
                draggable={false}
                tabIndex={primary ? undefined : -1}
                aria-hidden={primary ? undefined : true}
                aria-label={
                  primary ? `${book.title}${book.author ? `, ${book.author}` : ""}` : undefined
                }
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
          );
        })}
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
