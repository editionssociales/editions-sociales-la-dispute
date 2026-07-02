"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef } from "react";
import { Kicker } from "./kicker";

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

/** Doit rester synchronisé avec la classe `gap-[18px]` du rail ci-dessous. */
const CARD_GAP_PX = 18;

interface DragState {
  startX: number;
  startScrollLeft: number;
  moved: boolean;
}

/**
 * Rangée « Dernières parutions » : défilement horizontal avec ancrage (scroll
 * snap), flèches, glisser-déposer à la souris et couvertures réelles.
 * Aucun état React pour le glissement — tout passe par des refs et des
 * mutations DOM directes, pour ne jamais re-rendre à chaque pixel déplacé.
 */
export function NouveautesCarousel({ books }: { books: NouveauteBook[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const scrollByCard = useCallback((dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const width = card ? card.getBoundingClientRect().width : 240;
    const delta = dir * (width + CARD_GAP_PX);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.scrollLeft += delta;
    } else {
      el.scrollBy({ left: delta, behavior: "smooth" });
    }
  }, []);

  // Glisser-déposer à la souris uniquement (le tactile garde son défilement natif).
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = trackRef.current;
    if (!el) return;
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
      // Capture au franchissement du seuil seulement : capturer dès le
      // pointerdown re-ciblerait aussi les clics simples vers le rail.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = drag.startScrollLeft - dx;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLUListElement>) => {
    const el = trackRef.current;
    if (el) el.style.cursor = "grab";
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // Le clic éventuel est dispatché avant ce timer : guardClick voit encore
    // `moved` et bloque la navigation, puis on réarme pour le clic suivant.
    setTimeout(() => {
      if (dragRef.current) dragRef.current.moved = false;
    }, 0);
  }, []);

  // Empêche la navigation si le pointeur vient de glisser (>4px) plutôt que de cliquer.
  const guardClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (dragRef.current?.moved) {
      e.preventDefault();
      dragRef.current.moved = false;
    }
  }, []);

  if (books.length === 0) return null;

  return (
    <section aria-labelledby="nouveautes-heading">
      <div className="mb-[clamp(18px,2.4vw,28px)] flex items-end justify-between gap-4 px-[clamp(16px,4vw,64px)]">
        <div>
          <Kicker accent="ocher">Nouveautés</Kicker>
          <h2
            id="nouveautes-heading"
            className="mt-2 font-serif text-[clamp(28px,3.3vw,46px)] font-semibold leading-none text-ink"
          >
            Dernières parutions
          </h2>
        </div>
        <div className="flex flex-none gap-2">
          <button
            type="button"
            aria-label="Couverture précédente"
            onClick={() => scrollByCard(-1)}
            className="flex h-[clamp(44px,4vw,52px)] w-[clamp(44px,4vw,52px)] items-center justify-center border-[1.5px] border-ink bg-paper text-xl text-ink transition-colors hover:bg-ink hover:text-paper focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-2 motion-reduce:transition-none"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Couverture suivante"
            onClick={() => scrollByCard(1)}
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
        className="flex cursor-grab gap-[18px] overflow-x-auto px-[clamp(16px,4vw,64px)] pb-3.5 pt-1.5 [scroll-padding-left:clamp(16px,4vw,64px)] [scroll-snap-type:x_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {books.map((book) => (
          <li
            key={book.href}
            data-card
            className="w-[clamp(186px,21vw,252px)] flex-none [scroll-snap-align:start]"
          >
            <Link
              href={book.href}
              onClick={guardClick}
              draggable={false}
              className="block focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-4"
            >
              <div
                className="relative overflow-hidden bg-paper-2"
                style={{ aspectRatio: `${book.coverW} / ${book.coverH}` }}
              >
                {/* draggable=false : le drag HTML5 natif de l'image entrerait
                    en conflit avec le glissé-défilement du rail. */}
                <Image
                  src={book.coverUrl}
                  alt={`Couverture de « ${book.title} »`}
                  fill
                  sizes="260px"
                  draggable={false}
                  className="object-contain"
                />
                {book.upcoming && (
                  <span className="absolute left-0 top-0 bg-paper px-[9px] py-[5px] text-[10px] font-bold uppercase tracking-[0.13em] text-ink">
                    À paraître
                  </span>
                )}
                <span className="absolute right-0 top-0 bg-paper/90 px-1.5 py-[3px] text-[9.5px] font-medium uppercase tracking-[0.16em] text-ink-soft">
                  {book.imprint}
                </span>
              </div>
              <div className="pt-3">
                <p className="font-serif text-base font-semibold leading-tight text-ink">
                  {book.title}
                </p>
                {book.author && (
                  <p className="mt-0.5 text-[13px] text-muted">{book.author}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
