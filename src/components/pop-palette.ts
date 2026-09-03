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
 * **Contraste** (valeurs campagne 2026, cf. `globals.css`) : les quatre
 * teintes sont CLAIRES — le texte posé dessus est toujours `ink` (5,84:1 sur
 * l'orange, le pire couple ; ≥ 10:1 sur les trois autres), jamais `paper`
 * (2,95:1 sur l'orange, sous les 4,5:1 de AA — et c'est le MÊME couple que
 * « orange sur paper » plus bas, le contraste étant symétrique : un seul
 * chiffre pour les deux sens). Dans l'autre sens, SUR paper, PLUS AUCUNE
 * teinte n'atteint le seuil de 3:1 depuis le recalage sur les exports web
 * des affiches (décision client 2026-09-03 : la fidélité aux visuels prime
 * — l'orange print d'avant tenait 3,38:1, celui de campagne fait 2,95:1,
 * 2 % sous le seuil WCAG 1.4.11 des objets graphiques). L'orange reste de
 * loin la teinte la plus dense et continue de porter les traits existants
 * (pulse du rail des contreparties, focus de l'étagère 3D) — ne pas en
 * ajouter sur paper sans repeser ce 2,95:1. Rose (1,38:1), bleu (1,68:1) et
 * jaune (1,13:1) n'y servent QU'EN APLAT, texte `ink` par-dessus : en trait
 * sur paper ils sont invisibles. Un soulignement d'emphase se peint donc en
 * `decoration-pop-orange`, jamais en rose ni en bleu.
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
