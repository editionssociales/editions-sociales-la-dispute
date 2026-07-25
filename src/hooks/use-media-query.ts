"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Cache par requête : React relit le snapshot à CHAQUE rendu (et plusieurs
 * fois par rendu concurrent) — on ne recrée pas la `MediaQueryList` à chaque
 * lecture, et l'abonnement porte sur le MÊME objet que la lecture.
 */
const LISTS = new Map<string, MediaQueryList>();

function list(query: string): MediaQueryList {
  let mql = LISTS.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    LISTS.set(query, mql);
  }
  return mql;
}

/**
 * Vrai quand la media query correspond. `useSyncExternalStore` plutôt qu'un
 * `useState` + effet : la valeur est lue d'un système EXTERNE (le moteur de
 * rendu), pas dérivée — et l'écriture d'état dans un effet est interdite ici
 * (`react-hooks/set-state-in-effect`).
 *
 * Snapshot SERVEUR toujours `false` : le HTML rendu (et la première frame
 * hydratée) est donc le rendu « large », jamais un écran vide — même
 * fail-open que les Métriques (`hooks/use-in-view`). Le vrai état arrive au
 * rendu suivant l'hydratation.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = list(query);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => list(query).matches,
    () => false,
  );
}
