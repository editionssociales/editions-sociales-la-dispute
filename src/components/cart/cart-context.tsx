"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  addToCart as addToCartCore,
  cartCount,
  clearCart as clearCartCore,
  EMPTY_CART,
  parseCartState,
  removeFromCart as removeFromCartCore,
  serializeCartState,
  setLineQty as setLineQtyCore,
  type CartState,
} from "@/lib/cart-core";

/**
 * Provider client du panier (plan §4 étape 6) — état `localStorage`, îlot
 * client parmi les rares du repo (cf. `src/components/CLAUDE.md`). Monté
 * UNIQUEMENT à `COMMERCE_NATIVE=1` (`layout.tsx`) : à `0`, ni ce provider ni
 * aucun de ses consommateurs (`CartNavCell`, `AddToCartButton`, `CartView`)
 * n'existent dans l'arbre — règle d'or du lot, rien ne change en prod tant
 * que le flag est bas.
 */

const STORAGE_KEY = "es-ld-panier";

interface CartContextValue {
  state: CartState;
  /** Faux jusqu'à la relecture initiale de `localStorage` (effet post-montage) — évite d'afficher un panier vide une frappe avant sa vraie valeur. */
  ready: boolean;
  count: number;
  addToCart: (id: number, qty?: number) => void;
  setLineQty: (id: number, qty: number) => void;
  removeFromCart: (id: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  // Le serveur ne connaît jamais `localStorage` : premier rendu client
  // identique au serveur (panier vide), pas de mismatch d'hydratation. La
  // vraie valeur est relue juste après montage (effet ci-dessous).
  const [state, setState] = useState<CartState>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    // Enveloppé dans une fonction nommée (plutôt qu'un `setState` nu en tête
    // d'effet) — `react-hooks/set-state-in-effect` (React Compiler) signale
    // sinon un faux positif : ceci lit un système externe (`localStorage`)
    // au montage, le cas légitime que la règle documente elle-même.
    function hydrate() {
      setState(parseCartState(window.localStorage.getItem(STORAGE_KEY)));
      hydrated.current = true;
      setReady(true);
    }
    hydrate();
  }, []);

  /**
   * Applique un changement d'état ET persiste — dans le même geste, sur
   * l'état FRAIS calculé par l'updater (jamais sur l'état encore stale d'un
   * effet séparé). N'écrit qu'après l'hydratation initiale (ref synchrone,
   * contrairement à `ready` qui ne se répercute qu'au prochain rendu) : sans
   * cette garde, un mutateur déclenché avant la lecture `localStorage`
   * (impossible en pratique ici, mais defensive) écraserait un panier déjà
   * stocké avant même de l'avoir relu.
   */
  const mutate = useCallback((updater: (s: CartState) => CartState) => {
    setState((prev) => {
      const next = updater(prev);
      if (hydrated.current) {
        window.localStorage.setItem(STORAGE_KEY, serializeCartState(next));
      }
      return next;
    });
  }, []);

  const addToCart = useCallback(
    (id: number, qty = 1) => mutate((s) => addToCartCore(s, id, qty)),
    [mutate],
  );
  const setLineQty = useCallback(
    (id: number, qty: number) => mutate((s) => setLineQtyCore(s, id, qty)),
    [mutate],
  );
  const removeFromCart = useCallback((id: number) => mutate((s) => removeFromCartCore(s, id)), [mutate]);
  const clearCart = useCallback(() => mutate(() => clearCartCore()), [mutate]);

  const value: CartContextValue = {
    state,
    ready,
    count: cartCount(state),
    addToCart,
    setLineQty,
    removeFromCart,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** À utiliser uniquement sous `<CartProvider>` (donc uniquement à `COMMERCE_NATIVE=1`). */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error(
      "useCart() appelé hors de <CartProvider> — ce provider n'est monté qu'à COMMERCE_NATIVE=1.",
    );
  }
  return ctx;
}
