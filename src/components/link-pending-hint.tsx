"use client";

import { useLinkStatus } from "next/link";

/**
 * Témoin « navigation en cours » d'un `<Link>` — pagination et mosaïque des
 * libellés, dont les cellules sont de purs liens : elles ne passent par
 * aucune transition de `CatalogueFilters`, et un clic vers une vue dynamique
 * non préchargée restait sans AUCUN retour jusqu'au swap de contenu.
 *
 * Recette dictée par la doc `useLinkStatus` (`node_modules/next/dist/docs`) :
 * l'élément est TOUJOURS rendu, à taille fixe, en ABSOLU dans le coin
 * haut-droit de la cellule (jamais dans le flux : aucun saut de mise en
 * page) ; `.nav-hint`/`.nav-hint-pending` (`globals.css`) le font apparaître
 * avec 100 ms de retard — une navigation préchargée ou rapide ne fait jamais
 * clignoter le témoin. `bg-current` : il suit la couleur de texte de la
 * cellule, y compris à l'inversion survol/actif. À poser dans un `<Link>`
 * PARENT `relative` uniquement (contrainte du hook ET de l'absolu).
 */
export function LinkPendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`nav-hint absolute right-1 top-1 z-[1] h-1.5 w-1.5 bg-current ${pending ? "nav-hint-pending" : ""}`}
    />
  );
}
