"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useInView } from "@/hooks/use-in-view";

/**
 * Déclencheur PARTAGÉ des Métriques : un seul `useInView` hissé sur le bloc,
 * consommé par `<CountUp>` et `<Gauge>` pour qu'ils atterrissent sur la MÊME
 * frame (durées alignées à 1600 ms des deux côtés, même easeOutCubic). Deux
 * observers sur deux boîtes distinctes partaient sinon à des instants
 * différents — l'impact se dédoublait.
 *
 * OPT-IN par le contexte : hors provider la valeur est `null` et chaque
 * composant garde son propre déclencheur, donc aucun appelant existant ne
 * change de comportement. Le seuil est plus bas (0,25) que celui des
 * composants (0,4) : la boîte hissée est plus HAUTE que chacun d'eux
 * (compteur + CTA + jauge), 40 % de sa hauteur se gagneraient bien après son
 * entrée à l'écran.
 *
 * Fail-open intact (`src/components/CLAUDE.md`) : ce provider ne rend AUCUN
 * état masqué et ne touche pas au HTML serveur — il ne fait que dater le
 * départ des animations, repli temporisé de `use-in-view` compris.
 */
const ImpactFrameContext = createContext<boolean | null>(null);

/** `null` hors provider : l'appelant retombe sur son propre `useInView`. */
export function useImpactFrame(): boolean | null {
  return useContext(ImpactFrameContext);
}

export function ImpactFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });

  return (
    <div ref={ref} className={className}>
      <ImpactFrameContext.Provider value={inView}>{children}</ImpactFrameContext.Provider>
    </div>
  );
}
