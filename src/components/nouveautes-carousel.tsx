"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
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
  /** Dernière position X du pointeur (modèle incrémental : robuste au wrap en cours de glissé). */
  lastX: number;
  /** Position X initiale — sert au seuil de « vrai glissé » et à la garde de clic. */
  startX: number;
  moved: boolean;
  /** Vitesse de scroll lissée (px/ms, signe = sens du scrollLeft). */
  vx: number;
  /** Timestamp du dernier mouvement — pour ignorer l'inertie si on relâche après une pause. */
  lastT: number;
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

// Réglages de l'inertie (glissé souris avec élan). Ajustables au feeling.
const FLING_MIN = 0.2; // px/ms : en-dessous, on recentre simplement (pas d'élan)
const FRICTION_PER_FRAME = 0.985; // décélération par frame de 60 Hz (proche de 1 = coasting long)
const V_STOP = 0.08; // px/ms : sous ce seuil, l'inertie cède la main au ressort de fin
const V_STALE_MS = 60; // au relâchement, on ignore la vitesse si le dernier mouvement date de plus

/**
 * Carrousel « spring » des dernières parutions : les couvertures défilent en
 * coverflow — la couverture centrale est zoomée et pleinement opaque, les
 * latérales reculent (échelle, opacité, légère rotation 3D). Chaque couverture
 * est affichée à son ratio réel (hauteur commune, largeur variable) : aucune
 * bande, jamais coupée. Couverture seule : aucune légende texte — titre/auteur
 * restent accessibles via l'aria-label du lien, et les livres à paraître
 * portent une pastille « À paraître » en overlay sur la couverture. Les
 * transformations suivent le défilement image par image (aucun re-rendu par
 * pixel) ; la navigation (flèches, fin de glissé, focus clavier) recentre avec
 * un léger ressort.
 *
 * BOUCLE INFINIE : le catalogue est répété en plusieurs copies. Le contenu est
 * périodique (période = `advance`, largeur d'une copie) : on maintient donc en
 * permanence `scrollLeft` dans une fenêtre d'une largeur de copie autour d'une
 * position « home » (copie centrale). Dès qu'on en sort — d'un cran ou de
 * plusieurs tours d'un coup — on ramène `scrollLeft` par sauts entiers de
 * `advance` : le contenu étant identique, le saut est invisible. Ce recadrage
 * tourne à CHAQUE frame (glissé, inertie, ressort, molette), si bien qu'on ne
 * bute jamais sur le bord physique du rail, quelle que soit la force du geste.
 * Seule la copie centrale est exposée au clavier et aux lecteurs d'écran (les
 * autres sont `aria-hidden` / non focusables).
 */
export function NouveautesCarousel({ books }: { books: NouveauteBook[] }) {
  const n = books.length;
  // On ne boucle qu'à partir de deux livres (un seul : rien à faire tourner).
  const LOOP = n > 1;
  // Assez de copies pour garnir le viewport de part et d'autre du centre, même
  // avec peu de livres, ET pour garder ≥ 2 copies de marge de chaque côté de la
  // copie centrale — l'inertie peut alors déborder la fenêtre d'une demi-copie
  // sans jamais révéler le bord du rail.
  const COPIES = LOOP ? Math.max(5, Math.ceil(20 / n)) : 1;
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
  // Position « home » (px) : scrollLeft absolu qui centre la 1re carte de la
  // copie centrale. Ancre stable de la fenêtre de recadrage.
  const homeRef = useRef(0);
  // Passe à true dès que l'utilisateur pilote le scroll (molette, glissé,
  // flèches, focus). On cesse alors de recentrer automatiquement au chargement
  // des couvertures — sinon ces recentrages contrarient son défilement pendant
  // les ~5 s où les images arrivent.
  const engagedRef = useRef(false);

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

  /** Mesure le pas de la boucle (écart de centre entre la carte 0 et son
   *  homologue de la copie suivante, carte n) et la position « home »
   *  (scrollLeft absolu centrant la 1re carte de la copie centrale). Robuste aux
   *  largeurs variables et indépendant du scrollLeft courant. */
  const measureLoop = useCallback(() => {
    const el = trackRef.current;
    if (!el || !LOOP) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-card]");
    if (cards.length <= n) return;
    const a = cards[0].getBoundingClientRect();
    const b = cards[n].getBoundingClientRect();
    const adv = b.left + b.width / 2 - (a.left + a.width / 2);
    if (adv > 0) setAdvanceRef.current = adv;
    const homeCard = cards[middleStart];
    if (homeCard) {
      const vp = el.getBoundingClientRect();
      const r = homeCard.getBoundingClientRect();
      // scrollLeft + (centre carte − centre viewport) est invariant au scroll.
      homeRef.current = el.scrollLeft + (r.left + r.width / 2 - (vp.left + vp.width / 2));
    }
  }, [LOOP, n, middleStart]);

  /** Cœur de la boucle : ramène `scrollLeft` dans la fenêtre [home − pas/2,
   *  home + pas/2) par sauts entiers de `advance` (contenu périodique → saut
   *  invisible). Décous du calcul de la carte centrée : sûr à appeler à
   *  n'importe quelle frame. Les boucles `while` encaissent un débordement de
   *  plusieurs copies (fling très fort). Par défaut on s'abstient quand le focus
   *  clavier vit dans le rail (un saut écarterait la carte focalisée du centre) ;
   *  `force` outrepasse cette garde pendant un geste piloté (drag/inertie). */
  const wrap = useCallback(
    (force = false) => {
      const el = trackRef.current;
      if (!el || !LOOP) return;
      const advance = setAdvanceRef.current;
      if (!advance) return;
      if (!force && typeof document !== "undefined" && el.contains(document.activeElement)) {
        return;
      }
      const lo = homeRef.current - advance / 2;
      const hi = homeRef.current + advance / 2;
      let s = el.scrollLeft;
      if (s >= lo && s < hi) return;
      while (s < lo) s += advance;
      while (s >= hi) s -= advance;
      el.scrollLeft = s;
    },
    [LOOP],
  );

  /** Applique échelle / opacité / profondeur à chaque couverture selon sa
   *  distance au centre du viewport, retient l'indice le plus centré, puis
   *  recale la boucle. */
  const paint = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    // Recadrage AVANT de mesurer/appliquer les transforms : sinon le saut de
    // boucle (scrollLeft) précède d'une frame la mise à jour du coverflow, et
    // la carte centrale porte un instant les transforms d'une latérale (flash
    // au passage de la limite). En recadrant d'abord, scrollLeft et transforms
    // restent cohérents dans la même frame.
    if (LOOP) wrap();
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
    }
  }, [LOOP, wrap]);

  const schedulePaint = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paint();
    });
  }, [paint]);

  /** Anime `scrollLeft` d'un déplacement RELATIF `dist` avec un léger ressort.
   *  Le pilotage relatif (on applique la différence eased frame à frame) rend
   *  l'animation insensible aux recadrages de boucle qui surviennent en
   *  parallèle : on peut donc `wrap()` à chaque frame sans jamais corrompre la
   *  trajectoire. En mode non-boucle, on borne `scrollLeft` à [0, max]. */
  const springBy = useCallback(
    (dist: number) => {
      const el = trackRef.current;
      if (!el) return;
      if (animRef.current) cancelAnimationFrame(animRef.current);

      const clampNonLoop = () => {
        if (LOOP) return;
        const max = el.scrollWidth - el.clientWidth;
        el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft));
      };

      if (prefersReducedMotion()) {
        el.style.scrollSnapType = "";
        el.scrollLeft += dist;
        clampNonLoop();
        if (LOOP) wrap(true);
        return;
      }
      if (Math.abs(dist) < 1) {
        el.style.scrollSnapType = "";
        if (LOOP) wrap(true);
        return;
      }
      // Le scroll-snap `mandatory` happe scrollLeft sur un point de snap à chaque
      // frame : on le neutralise tant qu'on pilote le scroll en JS, rétabli à la
      // fin (la destination est déjà un point de snap → aucun à-coup).
      el.style.scrollSnapType = "none";
      const t0 = performance.now();
      const duration = 560;
      let applied = 0;
      const stepFrame = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const target = easeOutBack(p) * dist;
        el.scrollLeft += target - applied;
        applied = target;
        clampNonLoop();
        if (LOOP) wrap(true);
        paint();
        if (p < 1) {
          animRef.current = requestAnimationFrame(stepFrame);
        } else {
          animRef.current = 0;
          el.style.scrollSnapType = "";
          if (LOOP) wrap(true);
        }
      };
      animRef.current = requestAnimationFrame(stepFrame);
    },
    [LOOP, wrap, paint],
  );

  /** Recentre la couverture d'indice `i` dans le viewport (ressort). */
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
      springBy(delta);
    },
    [springBy],
  );

  /** Inertie : le rail continue sur sa lancée en décélérant (recadrage de boucle
   *  à chaque frame → traverse autant de tours que la vitesse le permet, sans
   *  jamais casser l'affichage), puis cède la main au ressort de fin dès que la
   *  vitesse retombe → arrêt en douceur, recentré sur la carte la plus proche. */
  const momentum = useCallback(
    (v0: number) => {
      const el = trackRef.current;
      if (!el) return;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      el.style.scrollSnapType = "none";
      let v = v0; // px/ms
      let last = performance.now();
      const frame = (now: number) => {
        const dt = Math.min(now - last, 40); // borne les gros gaps (onglet en fond)
        last = now;
        el.scrollLeft += v * dt;
        if (LOOP) wrap(true);
        paint();
        v *= Math.pow(FRICTION_PER_FRAME, dt / 16.667);
        if (Math.abs(v) <= V_STOP) {
          animRef.current = 0;
          // Arrêt en douceur : ressort vers la carte la plus proche (paint vient
          // de rafraîchir activeRef sur la position recadrée).
          centerCard(activeRef.current);
        } else {
          animRef.current = requestAnimationFrame(frame);
        }
      };
      animRef.current = requestAnimationFrame(frame);
    },
    [LOOP, wrap, paint, centerCard],
  );

  const step = useCallback(
    (dir: -1 | 1) => {
      engagedRef.current = true;
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = 0;
      }
      centerCard(activeRef.current + dir);
    },
    [centerCard],
  );

  // Peinture initiale + marges d'extrémité, puis à chaque défilement / redimensionnement.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    if (LOOP) measureLoop();
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
      if (LOOP) measureLoop();
      else applyEndPadding();
      centerCard(activeRef.current);
    };
    // Les couvertures se dimensionnent au ratio réel : leur largeur n'est exacte
    // qu'une fois l'image chargée. On recale alors le pas / les marges, et on
    // recentre — MAIS jamais pendant un glissé ni une fois que l'utilisateur a
    // pris la main (engagedRef), pour ne pas contrarier son défilement (capture,
    // car l'event `load` d'une image ne remonte pas).
    const onCoverLoad = () => {
      if (LOOP) measureLoop();
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
    measureLoop,
    schedulePaint,
    centerCard,
  ]);

  // Glisser-déposer à la souris (le tactile garde son défilement natif + snap).
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      if (e.pointerType !== "mouse") return;
      const el = trackRef.current;
      if (!el) return;
      engagedRef.current = true;
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = 0;
      }
      // Pas/home peuvent avoir bougé (images chargées après coup) : on rafraîchit
      // avant le geste pour un recadrage exact.
      if (LOOP) measureLoop();
      // Snap coupé pendant le glissé souris : `mandatory` happerait scrollLeft à
      // chaque frame et rendrait le glissé saccadé. Rétabli au relâchement.
      el.style.scrollSnapType = "none";
      dragRef.current = {
        startX: e.clientX,
        lastX: e.clientX,
        moved: false,
        vx: 0,
        lastT: performance.now(),
      };
      el.style.cursor = "grabbing";
    },
    [LOOP, measureLoop],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const el = trackRef.current;
      const drag = dragRef.current;
      if (!el || !drag) return;
      // Modèle incrémental : on avance de la différence depuis le dernier
      // mouvement — insensible à un recadrage de boucle survenu entre-temps.
      const dx = e.clientX - drag.lastX;
      const now = performance.now();
      const dt = now - drag.lastT || 16;
      drag.lastX = e.clientX;
      drag.lastT = now;
      if (!drag.moved && Math.abs(e.clientX - drag.startX) > 4) {
        drag.moved = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      el.scrollLeft -= dx;
      if (LOOP) wrap(true);
      // Vitesse de scroll lissée (EMA) ; le scroll va à l'inverse du pointeur.
      const inst = -dx / dt;
      drag.vx = 0.7 * inst + 0.3 * drag.vx;
      // paint() synchrone (et non schedulePaint) : les transforms se recalculent
      // dans la meme frame que le recadrage -> aucun flash au passage de la limite.
      paint();
    },
    [LOOP, wrap, paint],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const el = trackRef.current;
      const drag = dragRef.current;
      if (el) el.style.cursor = "grab";
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (drag?.moved && el) {
        // Vitesse retenue seulement si le geste était encore vif au lâcher.
        const fresh = performance.now() - drag.lastT <= V_STALE_MS;
        const v = fresh ? drag.vx : 0;
        if (!prefersReducedMotion() && Math.abs(v) >= FLING_MIN) {
          // Élan : traverse plusieurs tours puis s'arrête en douceur.
          momentum(v);
        } else {
          // Glissé sans élan : recentre au ressort (springBy rétablit le snap).
          centerCard(activeRef.current);
        }
      } else if (el) {
        // Survol/clic sans glissé : on rétablit le snap coupé au pointerdown.
        el.style.scrollSnapType = "";
      }
      setTimeout(() => {
        if (dragRef.current) dragRef.current.moved = false;
      }, 0);
    },
    [centerCard, momentum],
  );

  // Empêche la navigation si le pointeur vient de glisser (>4px) plutôt que de cliquer.
  const guardClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (dragRef.current?.moved) {
      e.preventDefault();
      dragRef.current.moved = false;
    }
  }, []);

  if (n === 0) return null;
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
          <h1 className="font-sans text-[clamp(30px,4.4vw,54px)] font-black italic uppercase leading-[0.94] text-black">
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
                  primary
                    ? `${book.title}${book.author ? `, ${book.author}` : ""}${book.upcoming ? ", à paraître" : ""}`
                    : undefined
                }
                className="block origin-center will-change-transform focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-4"
              >
                {/* Hauteur commune fixée ; la largeur suit le ratio réel de
                    l'image (aucune bande, jamais coupée). draggable=false : le
                    drag HTML5 natif entrerait en conflit avec le glissé du rail. */}
                <div className="relative h-[var(--cover-h)] w-fit bg-paper-2 shadow-[0_14px_34px_rgba(23,20,15,0.16)] ring-1 ring-line">
                  {book.upcoming && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-0 z-[1] border-b-2 border-r-2 border-black bg-pop-orange px-1.5 py-0.5 font-sans text-[10px] font-extrabold uppercase tracking-[.05em] text-black"
                    >
                      À paraître
                    </span>
                  )}
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
    </section>
  );
}
