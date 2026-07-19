import type { NavSectionId } from "@/lib/nav";

/**
 * Code couleur pop des 4 sections de nav (`NAV_SECTIONS`) — classes Tailwind
 * statiques (le JIT ne compile pas `bg-pop-${id}` construit dynamiquement).
 * `lib/nav.ts` ne porte que le contenu/la logique ; les tables d'accent
 * littérales restent ici, côté présentation (contrat documenté dans
 * `lib/nav.ts`).
 *
 * Source unique de la correspondance section → aplat pop : consommée par le
 * quadrillage du header (`site-header.tsx`, cellules actives) ET par la
 * mosaïque de pied de page de l'accueil (chantier 4 §4) — la palette pop
 * boucle entre les deux, un seul jeu de valeurs (R2 : « pop = langage de
 * navigation, rien d'autre »). Fichier plat, sans `"use client"` : importable
 * aussi bien par le header (client) que par la page d'accueil (serveur).
 */
export const NAV_ACCENT_BG: Record<NavSectionId, string> = {
  catalogue: "bg-pop-pink",
  geme: "bg-pop-teal",
  "a-paraitre": "bg-pop-orange",
  agenda: "bg-pop-yellow",
};
