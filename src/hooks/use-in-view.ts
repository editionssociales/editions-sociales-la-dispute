"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Seam interne partagée : « nouvel IntersectionObserver → setState(true) une
 * seule fois → disconnect ». Révèle un élément à sa première entrée dans le
 * viewport, puis se déconnecte (l'effet ne se rejoue jamais).
 *
 * Chaque appelant ne garde que sa propre peinture — fondu (Reveal), comptage
 * (CountUp), remplissage (Gauge) —, la mécanique d'observation vit ici une
 * seule fois. `threshold` et `rootMargin` sont des primitives : deps stables,
 * pas de recréation de l'observer à chaque rendu.
 */
export function useInView<T extends Element = HTMLDivElement>({
  threshold = 0,
  rootMargin,
}: { threshold?: number; rootMargin?: string } = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin]);

  return [ref, inView];
}
