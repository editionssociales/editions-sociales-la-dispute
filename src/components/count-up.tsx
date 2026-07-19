"use client";

import { useEffect, useState } from "react";
import { formatInt } from "@/lib/format";
import { useInView } from "@/hooks/use-in-view";

/** Compteur animé : grimpe de 0 à `value` quand il devient visible. */
export function CountUp({
  value,
  suffix = "",
  duration = 1600,
  className = "",
}: {
  value: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>({ threshold: 0.4 });
  // SSR = valeur finale (bots/no-JS lisent le vrai nombre, jamais « 0 ») ;
  // l'animation 0 → valeur ne s'exécute que côté client, à l'entrée en vue.
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView) return;
    // Mouvement réduit : on saute à la valeur finale (première frame p=1), sans
    // animer. `setDisplay` reste ainsi appelé dans un callback rAF, jamais
    // synchronement dans le corps de l'effet.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = reduce ? 1 : Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={className}>
      {formatInt(display)}
      {suffix}
    </span>
  );
}
