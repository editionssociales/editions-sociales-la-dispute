"use client";

import {
  createContext,
  useContext,
  useMemo,
  useTransition,
  type ReactNode,
  type TransitionStartFunction,
} from "react";

/**
 * Transition partagée des vues catalogue (/catalogue, /catalogue/[edition]).
 * Le `useTransition` vivait DANS `CatalogueFilters` : pendant une navigation
 * de filtre, seul le bandeau de contrôles s'estompait — le compteur de
 * résultats et la grille, la zone qui va réellement changer, restaient à
 * opacité pleine. Le provider remonte l'état d'un cran ; les pages posent une
 * `CatalogueTransitionZone` autour des résultats. Les enfants de zone restent
 * des sous-arbres SERVEUR passés en `children` : seule l'enveloppe est
 * cliente, rien du rendu de la grille ne bascule côté client.
 */
interface CatalogueTransition {
  pending: boolean;
  start: TransitionStartFunction;
}

const CatalogueTransitionContext = createContext<CatalogueTransition | null>(null);

export function CatalogueTransitionProvider({ children }: { children: ReactNode }) {
  const [pending, start] = useTransition();
  const value = useMemo(() => ({ pending, start }), [pending, start]);
  return (
    <CatalogueTransitionContext.Provider value={value}>
      {children}
    </CatalogueTransitionContext.Provider>
  );
}

/** À utiliser uniquement sous `<CatalogueTransitionProvider>` (posé par les pages catalogue). */
export function useCatalogueTransition(): CatalogueTransition {
  const ctx = useContext(CatalogueTransitionContext);
  if (!ctx) {
    throw new Error(
      "useCatalogueTransition() hors de <CatalogueTransitionProvider> — ce provider est posé par les pages catalogue.",
    );
  }
  return ctx;
}

/**
 * Sous-arbre estompé pendant la transition — la MÊME recette `opacity-70` que
 * le bandeau de filtres (`catalogue-filters.tsx`), jamais une deuxième.
 */
export function CatalogueTransitionZone({ children }: { children: ReactNode }) {
  const { pending } = useCatalogueTransition();
  return (
    <div
      className={`transition-opacity motion-reduce:transition-none ${pending ? "opacity-70" : ""}`}
    >
      {children}
    </div>
  );
}
