"use client";

import { useEffect } from "react";
import { useCart } from "./cart-context";

/**
 * Vide le panier à l'arrivée sur la confirmation de commande (`/merci`) — le
 * paiement Stripe est parti (encaissé ou en confirmation asynchrone) ; sans
 * ce geste, le panier resterait plein en `localStorage` et inviterait à
 * recommander les mêmes articles (constaté en recette E9 le 13/07).
 *
 * Attend `ready` : les effets React s'exécutent enfant d'abord, donc un
 * `clearCart()` au montage partirait AVANT l'hydratation du provider
 * (`hydrated.current` encore faux → localStorage non écrit) et serait
 * aussitôt écrasé par la relecture du panier stocké. `ready` ne passe à true
 * qu'après cette relecture — le clear écrit alors réellement.
 *
 * À ne rendre que quand la session Stripe relue est bien une commande —
 * c'est la page serveur (`merci`) qui porte cette garde.
 */
export function ClearCartOnConfirmation() {
  const { ready, clearCart } = useCart();
  useEffect(() => {
    if (ready) clearCart();
  }, [ready, clearCart]);
  return null;
}
