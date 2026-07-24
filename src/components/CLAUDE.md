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

- **Serveur par défaut** : `"use client"` seulement pour Navigation (`site-header`, `catalogue-filters` et `filter-chips` qu'il rend, `libelle-view-switch` — bascule temporaire entre les deux vues de libellés), Carrousels (`nouveautes-carousel`), Métriques (`count-up`, `gauge`, `reveal`), Formulaires (`newsletter-form`, `contact-form`, `submit-button`), Étagères 3D (`shelf-lock`, `shelf-cover`), Panier (`cart/cart-context`, `cart/cart-badge`, `cart/add-to-cart-button`, `cart/clear-cart-on-confirmation`) — cf. implémentation pour détails des états/effets portés. `nav-accent.ts` reste plat, importable des deux arbres.
- **Couvertures** : toujours via `Cover`/`BookCover` (`src/lib/cover.tsx`), ratio réel.
- **Fail-open des Métriques** (`reveal`, `count-up`, via `hooks/use-in-view`) : le HTML serveur est TOUJOURS visible et porte la vraie valeur (bots/no-JS) ; le masquage/l'animation n'arrivent qu'après hydratation (hors viewport seulement), avec repli temporisé si IntersectionObserver ne délivre jamais. Ne jamais réintroduire un état initial `opacity-0`/`0` rendu côté serveur.
- **Constitution graphique (R1-R8, refonte 2026-07 ; épure minimaliste 2026-07)** : R1 ink/paper seul, jamais black/white littéraux (`text-black/70` → `text-ink/70`), `bg-paper-2` seule 3ᵉ teinte • R2 pop-colors (pink/teal/orange/yellow) pour nav/statut seulement (exception actée : bandeaux pop-teal du gabarit /a-propos, maquette client 2026-07) • R3 accents maison (navy=Éditions, brick=Dispute) + sémantique (bottle=succès, ocher=attente, brick=échec) via `lib/accents`, `lib/format` • R4 un seul CTA : `<Button>` (`button.tsx`, variants dont `invert` pour fond ink — recette `INVERT` réutilisée par `SubmitButton`), hover par inversion ink↔paper • R5 deux anneaux focus `FOCUS_RING_*` (`lib/ui.ts`), zéro fait main • R6 typo fermée : `<PageHero>` (titre + chapeau), `text-muted` secondaire, `max-w-[70ch]` prose — jamais de surtitre (« eyebrow ») au-dessus d'un titre, ni d'info de navigation dupliquée (fil d'ariane) : la couverture/le titre portent déjà l'info • R7 tout interactif : hover/focus-visible/active/disabled/pending, cibles `min-h-11`/`h-11 w-11` • R8 brutalisme : aplat shadow `shadow-[8px...]`, zéro radius sauf pointillés `/rencontres`, skeletons = trame réelle.

## Ubiquitous Language

- **Primitive partagée** : composant serveur (zéro `"use client"`), réutilisable arbre serveur/client — `FramedGrid` (grille), `Button` (CTA), `PageHero` (en-têtes page, titre + chapeau seuls), `LibelleMosaic` (l'UNIQUE rendu des libellés pour /catalogue ET /catalogue/[edition], ne jamais la re-inliner — deux vues en liste horizontale, rectangles simples / cases variables, derrière le switch client temporaire `libelle-view-switch` en attendant l'arbitrage client).

## Decisions

- Les primitives partagées ne fixent que la recette visuelle commune ; padding,
  taille et disposition restent l'affaire de l'appelant via `className`, pour ne
  pas figer un contrat de props par usage.
