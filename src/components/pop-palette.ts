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
 * toujours `ink` (5,09:1 sur l'orange), jamais `paper` (3,38:1, sous les
 * 4,5:1 de AA — et c'est le MÊME couple que « orange sur paper » plus bas, le
 * contraste étant symétrique : un seul chiffre pour les deux sens). Dans
 * l'autre sens, SUR paper, seul `orange` passe le seuil de 3:1 (3,38:1) : lui
 * seul y sert de couleur de TEXTE (AA large seulement, corps ≥ 24px ou ≥ 19px
 * gras) et de TRAIT — soulignement décoratif, filet, contour (3:1 = seuil
 * WCAG 1.4.11 pour un objet graphique). Rose (1,73:1), bleu (1,74:1) et jaune
 * (1,13:1) n'y servent QU'EN APLAT, texte `ink` par-dessus : en trait sur
 * paper ils sont à la limite de l'invisible. Un soulignement d'emphase se
 * peint donc en `decoration-pop-orange`, jamais en rose ni en bleu.
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
