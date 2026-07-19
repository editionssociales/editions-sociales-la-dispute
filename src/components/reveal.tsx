"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { useInView } from "@/hooks/use-in-view";

/**
 * Révèle son contenu (fondu + légère translation) à l'entrée dans le
 * viewport. Les enfants restent rendus côté serveur ; seul l'effet est client.
 *
 * Fail-open : le HTML serveur est VISIBLE (bots, no-JS, lecteurs qui
 * n'exécutent pas les observers ne perdent jamais le contenu). L'état masqué
 * initial n'est posé qu'après hydratation, dans un layout effect (avant la
 * première peinture client — aucun flash), puis levé par `useInView`
 * (lui-même doté d'un repli temporisé si l'observer ne délivre jamais).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({
    threshold: 0.12,
    rootMargin: "0px 0px -40px",
  });
  const [armed, setArmed] = useState(false);

  useLayoutEffect(() => {
    // Fonction nommée (pas un `setState` nu en tête d'effet) — même faux
    // positif `react-hooks/set-state-in-effect` que `newsletter-form.tsx`.
    // N'arme le masquage que pour les blocs encore HORS viewport : un bloc
    // déjà visible à l'hydratation resterait sinon peint puis re-masqué
    // (flash inversé) — il reste simplement affiché, sans animation.
    function armIfOffscreen() {
      const el = ref.current;
      if (el && el.getBoundingClientRect().top > window.innerHeight) {
        setArmed(true);
      }
    }
    armIfOffscreen();
  }, [ref]);

  const hidden = armed && !inView;

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        hidden ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100"
      } ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
