"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Coordonne l'étagère 3D du héro : un seul livre s'anime à la fois.
 *
 * Un livre survolé s'ouvre après un court dwell (150 ms), va TOUJOURS au bout de
 * sa sortie même si la souris repart, puis se range entièrement (repli complet)
 * AVANT qu'un autre livre ne puisse s'animer. Le CSS `:hover` ne peut pas
 * exprimer cette exclusion temporelle entre voisins : on pilote donc la classe
 * `is-open` sur les `.book3d` d'après les survols (pointerover/out délégués), et
 * le CSS fait le rendu. `:focus-visible` reste géré en CSS pour le clavier.
 */
export function ShelfLock({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const DWELL = reduce ? 0 : 150; // délai avant l'ouverture
    const ANIM = reduce ? 0 : 440; // durée d'une transition (doit matcher le CSS)

    let hovered: HTMLElement | null = null; // livre sous le pointeur
    let openEl: HTMLElement | null = null; // livre actuellement ouvert
    let phase: "idle" | "opening" | "open" | "closing" = "idle";
    let dwellT = 0;
    let animT = 0;

    function bookOf(t: EventTarget | null): HTMLElement | null {
      return t instanceof Element ? t.closest<HTMLElement>(".book3d") : null;
    }

    function tryOpen(book: HTMLElement) {
      if (phase !== "idle") return; // occupé : aucun autre livre ne s'anime
      clearTimeout(dwellT);
      dwellT = window.setTimeout(() => {
        if (hovered === book && phase === "idle") beginOpen(book);
      }, DWELL);
    }
    function beginOpen(book: HTMLElement) {
      openEl = book;
      phase = "opening";
      book.classList.add("is-open");
      clearTimeout(animT);
      animT = window.setTimeout(onOpened, ANIM);
    }
    function onOpened() {
      phase = "open";
      if (hovered !== openEl) beginClose(); // le pointeur est déjà reparti
    }
    function beginClose() {
      if (!openEl) return;
      phase = "closing";
      openEl.classList.remove("is-open");
      clearTimeout(animT);
      animT = window.setTimeout(onClosed, ANIM);
    }
    function onClosed() {
      openEl = null;
      phase = "idle";
      if (hovered) tryOpen(hovered); // un livre est déjà survolé : à lui d'ouvrir
    }

    function onOver(e: PointerEvent) {
      const book = bookOf(e.target);
      if (!book || book === hovered) return;
      hovered = book;
      tryOpen(book);
    }
    function onOut(e: PointerEvent) {
      const book = bookOf(e.target);
      const to = bookOf(e.relatedTarget);
      if (!book || to === book) return; // déplacement interne au même livre
      if (hovered === book) hovered = null;
      clearTimeout(dwellT); // annule un dwell en attente
      if (phase === "open" && openEl === book) beginClose();
      // en "opening", onOpened refermera (hovered !== openEl)
    }

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    return () => {
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      clearTimeout(dwellT);
      clearTimeout(animT);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
