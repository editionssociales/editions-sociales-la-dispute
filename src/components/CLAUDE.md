# src/components

## Purpose

Couche de présentation brutaliste : rendu visuel des pages + la fine tranche
d'interactivité client dont certains écrans ont besoin. Ne détient ni les
données ni le routage.

## Ownership

- **Owns** : le rendu visuel (grille encadrée, cartes, nav, pied, carrousel) et
  les slivers client (état / effet / handler) qui l'accompagnent.
- **Does NOT own** : le modèle de données (`Book`, lu depuis `src/lib`) ni le
  routage / les pages (`src/app`).

## Local Contracts

- **Serveur par défaut** : `"use client"` réservé aux composants qui portent
  réellement un état/effet/handler — `site-header` (compactage au scroll +
  section active), `catalogue-filters` (sync URL, debounce, `useTransition`) et
  `filter-chips` qu'il rend, `nouveautes-carousel` (drag pointeur, coverflow
  « spring »), `count-up` / `gauge` / `reveal` (révélation au scroll via
  `useInView`, `src/hooks/use-in-view`), `shelf-lock` / `shelf-cover` (étagère 3D
  du héro : exclusion d'ouverture entre livres, ratio réel de couverture). Tout
  le reste est composant serveur.
- Les couvertures passent toujours par `Cover` / `BookCover` (`src/lib/cover.tsx`) :
  jamais recadrées, au ratio réel de l'image.

## Ubiquitous Language

- **Primitive partagée** : composant plat, sans `"use client"`, utilisable aussi
  bien dans un arbre serveur que client — `FramedGrid` (recette de la grille
  encadrée, hairline noir), `Breadcrumb` (fil d'ariane ; sa dernière miette est
  toujours du texte, jamais un lien — une page qui a besoin d'un dernier maillon
  cliquable garde son fil inline plutôt que d'utiliser ce composant), `Button`
  (recette CTA couleur/bordure/hover/focus).

## Decisions

- Les primitives partagées ne fixent que la recette visuelle commune ; padding,
  taille et disposition restent l'affaire de l'appelant via `className`, pour ne
  pas figer un contrat de props par usage.
