import type { NavSectionId } from "@/lib/nav";
import { POP_BG } from "./pop-palette";

/**
 * Code couleur pop des 4 sections de nav (`NAV_SECTIONS`) — classes Tailwind
 * statiques (le JIT ne compile pas `bg-pop-${id}` construit dynamiquement).
 * `lib/nav.ts` ne porte que le contenu/la logique ; les tables d'accent
 * littérales restent ici, côté présentation (contrat documenté dans
 * `lib/nav.ts`).
 *
 * Source unique de la correspondance section → aplat pop : consommée par le
 * quadrillage du header (`site-header.tsx`, cellules actives) ET par la
 * mosaïque de pied de page de l'accueil (chantier 4 §4) — un seul jeu de
 * valeurs. Les classes elles-mêmes viennent de `pop-palette.ts`, source unique
 * des quatre couleurs du site depuis qu'elles ne servent plus qu'à la
 * navigation (retour Clara 2026-08-07 : /souscription et les pages maisons
 * passent sur la même palette). Fichier plat, sans `"use client"` : importable
 * aussi bien par le header (client) que par la page d'accueil (serveur).
 */
export const NAV_ACCENT_BG: Record<NavSectionId, string> = {
  catalogue: POP_BG.pink,
  geme: POP_BG.teal,
  "a-paraitre": POP_BG.orange,
  agenda: POP_BG.yellow,
};
