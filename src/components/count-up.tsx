"use client";

import { useEffect, useState } from "react";
import { formatInt } from "@/lib/format";
import { useInView } from "@/hooks/use-in-view";
import { useImpactFrame } from "@/components/impact-frame";

/**
 * Compteur animé : grimpe de 0 à `value` quand il devient visible — ou, sous
 * `<ImpactFrame>`, au signal PARTAGÉ du bloc, pour atterrir sur la même frame
 * que la jauge (`duration` et easeOutCubic communs). Hors provider, rien ne
 * change : le compteur garde son propre observer.
 *
 * Boîte figée à la valeur finale (anti-CLS) : un sizer invisible porte
 * `value` formatée pendant que l'overlay absolu anime — le nombre de
 * chiffres qui varie ne re-wrappe jamais le paragraphe hôte, et
 * `tabular-nums` supprime le jitter par chiffre. Séparation AT/visuel :
 * l'animation est `aria-hidden` (un lecteur d'écran qui passe pendant les
 * 1,6 s lirait un montant faux), un `sr-only` stable porte la valeur finale.
 */
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
  const [ref, ownInView] = useInView<HTMLSpanElement>({ threshold: 0.4 });
  // Déclencheur partagé quand le compteur est monté dans un `<ImpactFrame>`
  // (`null` sinon) : `??` et pas `||`, un `false` partagé doit gagner.
  const shared = useImpactFrame();
  const inView = shared ?? ownInView;
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
      const next = Math.round(value * eased);
      // Écrit fonctionnel (#90) : `gauge.tsx` anime en CSS, ce compteur reste
      // en rAF (l'affichage combine chiffres ET séparateurs de milliers,
      // hors de portée d'un `@property`/keyframe CSS) — mais n'écrit l'état
      // qu'aux PALIERS d'affichage réels. React compare par `Object.is` et
      // saute le rendu quand la valeur ne change pas : sur les paliers finaux
      // (easeOutCubic aplati), plusieurs frames consécutives arrondissent au
      // même entier, ce qui évite déjà une partie des ~96 rendus du rAF brut.
      setDisplay((prev) => (prev === next ? prev : next));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={`relative inline-block whitespace-nowrap tabular-nums ${className}`}>
      {/* Sizer : fige la largeur à la valeur finale, jamais rendu aux AT. */}
      <span className="invisible" aria-hidden="true">
        {formatInt(value)}
        {suffix}
      </span>
      {/* Valeur animée, purement visuelle. */}
      <span aria-hidden="true" className="absolute inset-0">
        {formatInt(display)}
        {suffix}
      </span>
      <span className="sr-only">
        {formatInt(value)}
        {suffix}
      </span>
    </span>
  );
}
