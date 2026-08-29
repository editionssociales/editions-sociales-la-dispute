/**
 * Mention unique du délai de livraison — demande client 2026-08-26
 * (« entre 48h et 10 jours », pour tempérer l'attente des client·es
 * pressé·es) : énoncée ICI une seule fois et consommée par la fiche produit
 * (`buy-links.tsx`), le panier (`cart-view.tsx`), la page de remerciement
 * (`merci/page.tsx`), le mail de confirmation (`order-mail.ts`) et les CGV
 * (`cgv/page.tsx`). Constante dure, même parti pris que `contact-address.ts` :
 * une promesse faite au public ne dépend pas de la configuration. Espaces
 * insécables entre valeur et unité (typographie française).
 */
export const DELIVERY_DELAY_RANGE = "entre 48 h et 10 jours";
