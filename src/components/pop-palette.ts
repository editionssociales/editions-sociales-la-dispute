/**
 * LES quatre couleurs du site — rose, « bleu » (turquoise), orange, jaune —
 * en classes Tailwind littérales (le JIT ne compile pas `bg-pop-${c}`).
 *
 * Source unique de la palette, consommée par la navigation (`nav-accent.ts`),
 * la page de souscription et son rail de contreparties, les pages de
 * présentation des maisons, la jauge de collecte et son liseré. Le client les
 * désigne comme « les couleurs du site : le bleu, le rose, le jaune et
 * l'orange » (retour Clara 2026-08-07) — d'où la bascule des accents de
 * couverture (navy/bottle/ocher/brick) vers cette palette sur les pages
 * qu'elle a relevées.
 *
 * **Contraste** : les quatre teintes sont CLAIRES — le texte posé dessus est
 * toujours `ink`, jamais `paper` (paper sur orange ≈ 2,9:1, sous AA). Dans
 * l'autre sens, seul `orange` tient un texte pop SUR paper (≈3,4:1, AA large
 * seulement) : rose, bleu et jaune ne s'y emploient qu'en APLAT ou en filet,
 * jamais en couleur de texte ni en filet fin sur fond clair.
 *
 * Fichier plat, sans `"use client"` : importable des deux arbres (le header
 * client comme les pages serveur), précédent `nav-accent.ts`/`rail-inset.ts`.
 */

export type PopColor = "pink" | "teal" | "orange" | "yellow";

/**
 * Ordre canonique de la palette : celui du liseré multicolore et des cycles de
 * cartes (rail des contreparties). Ne pas réordonner sans regarder ces deux
 * rendus — la suite des couleurs y est visible d'un coup d'œil.
 */
export const POP_ORDER: PopColor[] = ["pink", "teal", "orange", "yellow"];

export const POP_BG: Record<PopColor, string> = {
  pink: "bg-pop-pink",
  teal: "bg-pop-teal",
  orange: "bg-pop-orange",
  yellow: "bg-pop-yellow",
};
