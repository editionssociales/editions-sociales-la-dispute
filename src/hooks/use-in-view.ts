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
    // Fail-open : sans IntersectionObserver (navigateur exotique), ou si ses
    // callbacks ne sont jamais délivrés (onglet gelé, rendus headless type
    // Googlebot qui ne produisent pas de frames), le contenu ne doit JAMAIS
    // rester masqué — révélation forcée après un délai de grâce.
    // Fonction nommée (pas un `setState` nu) — même faux positif
    // `react-hooks/set-state-in-effect` que `newsletter-form.tsx` : la
    // visibilité forcée est un événement externe au rendu (temps/inexistence
    // de l'API), jamais dérivable pendant le rendu.
    function forceReveal() {
      setInView(true);
    }
    if (typeof IntersectionObserver === "undefined") {
      forceReveal();
      return;
    }
    // `io` déclaré avant le minuteur (jamais initialisé au moment de la
    // planification, mais toujours assigné avant que le callback puisse
    // s'exécuter) : le repli à 2s doit aussi déconnecter l'observer (#90) —
    // sans quoi il restait actif indéfiniment après avoir déjà forcé la
    // révélation, une fuite pour chaque bloc dont l'observer ne délivre
    // jamais (onglet gelé, rendu headless).
    let io: IntersectionObserver;
    const fallback = window.setTimeout(() => {
      forceReveal();
      io.disconnect();
    }, 2000);
    io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          window.clearTimeout(fallback);
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => {
      window.clearTimeout(fallback);
      io.disconnect();
    };
  }, [threshold, rootMargin]);

  return [ref, inView];
}
