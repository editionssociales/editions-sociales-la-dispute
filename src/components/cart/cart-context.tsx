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
 * client parmi les rares du repo (cf. `src/components/CLAUDE.md`). Monté par
 * `layout.tsx` sur tout le site : ses consommateurs (`CartNavCell`,
 * `AddToCartButton`, `CartView`) le supposent toujours présent dans l'arbre.
 */

const STORAGE_KEY = "es-ld-panier";

/**
 * Délai avant réinitialisation du message d'annonce — purement pour ne pas
 * laisser une région live encombrée d'un texte périmé ; la remise à `""`
 * PUIS au message (au lieu d'un simple `setState` du message) est ce qui
 * garantit qu'un ajout identique consécutif soit reannoncé : un lecteur
 * d'écran ne relit un `role="status"` que sur un changement de contenu.
 */
const ANNOUNCEMENT_RESET_MS = 4000;

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
  const [announcement, setAnnouncement] = useState("");
  // `number` et non `ReturnType<typeof window.setTimeout>` : @types/node est
  // dans le programme, et ce `ReturnType` s'y résout en `Timeout` (Node) alors
  // que `window.setTimeout` rend bien un `number` (DOM) à l'exécution.
  const announcementTimeout = useRef<number | null>(null);

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

  useEffect(() => {
    // Synchronisation inter-onglets : `storage` ne se déclenche que dans les
    // AUTRES onglets que celui qui a écrit (jamais dans celui qui vient de
    // muter, cf. `mutate` ci-dessous) — sans cet écouteur, deux onglets
    // ouverts sur le site divergent silencieusement dès qu'un panier change
    // dans l'un des deux. `parseCartState` retombe déjà sur `EMPTY_CART`
    // quand `e.newValue` est `null` (onglet qui vide son panier).
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setState(parseCartState(e.newValue));
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    return () => {
      if (announcementTimeout.current != null) window.clearTimeout(announcementTimeout.current);
    };
  }, []);

  /**
   * Alimente la région live unique du provider (`role="status"` rendue
   * ci-dessous) — partagée par les DEUX variantes de `AddToCartButton`
   * (`chip` et `button`), qui ne rendent chacune aucun retour accessible par
   * elles-mêmes (chip : rien à l'écran ; button : bascule de texte 1,5 s hors
   * de tout live region). Remise à `""` PUIS au message, sur deux ticks —
   * jamais un simple `setState(message)` : un lecteur d'écran ne relit un
   * `role="status"` que sur un changement de contenu, et deux ajouts
   * consécutifs poseraient sinon deux fois le même texte sans être annoncés
   * la seconde fois.
   */
  const announce = useCallback((message: string) => {
    if (announcementTimeout.current != null) window.clearTimeout(announcementTimeout.current);
    setAnnouncement("");
    announcementTimeout.current = window.setTimeout(() => {
      setAnnouncement(message);
      announcementTimeout.current = window.setTimeout(() => setAnnouncement(""), ANNOUNCEMENT_RESET_MS);
    }, 50);
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
    (id: number, qty = 1) => {
      mutate((s) => addToCartCore(s, id, qty));
      announce(qty > 1 ? `${qty} exemplaires ajoutés au panier.` : "Article ajouté au panier.");
    },
    [mutate, announce],
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

  return (
    <CartContext.Provider value={value}>
      {children}
      {/* Région live unique du panier (#82c) — un seul `role="status"` pour
          les deux variantes de `AddToCartButton`, jamais une par bouton. */}
      <div role="status" className="sr-only">
        {announcement}
      </div>
    </CartContext.Provider>
  );
}

/** À utiliser uniquement sous `<CartProvider>` (monté par le layout du site). */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error(
      "useCart() appelé hors de <CartProvider> — ce provider est monté par le layout (site).",
    );
  }
  return ctx;
}
