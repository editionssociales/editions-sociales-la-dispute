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

- **Serveur par défaut** : seulement Navigation, Carrousels, Métriques, Formulaires, Étagères 3D, Feuille mobile, Mosaïque, Panier, Témoins de transition (`catalogue-transition.tsx` — estompage compteur+grille pendant un filtre ; `link-pending-hint.tsx` — témoin `useLinkStatus` de pagination/mosaïque) et Mini fiche au survol (`book-hover-card.tsx`) portent `"use client"` — exceptions documentées en code. `nav-accent.ts`/`rail-inset.ts`/`pop-palette.ts` restent plats, importables des deux arbres.
- **Repli e-mail** : l'adresse publique (`src/lib/contact-address`) reste visible en permanence ; Brevo absent ⇒ `mailto:` seul ; `contact-form` renvoie le fallback dans son état.
- **Surgissements — deux grammaires** : les déroulés (header mobile, mosaïque) — bouton `aria-expanded` porte l'état, chevron tourne, repli par `inert` jamais `visibility`, focus suit la bascule (verrouillé par `mosaic-disclosure.test.tsx`) ; la mini fiche au survol (`book-hover-card.tsx`, `BookHoverCard`) — tooltip ARIA (`role="tooltip"` + `aria-describedby` carte ouverte seulement, JAMAIS `aria-expanded`), purement présentationnelle sur DTO serveur (`BookHoverCardData`, `src/lib/book-hover-card-data.ts`), portail `document.body` en `fixed` `z-[80]` (jamais en flux : `Reveal`/`overflow-hidden` casseraient), inerte sur `(hover: none)` (un tap garde le comportement natif de l'enfant), aucun élément interactif dans la carte (nested-interactive) — délais/fermetures/`@starting-style` commentés en code, verrouillé par `book-hover-card.test.tsx`.
- **Header** : layout unique sous `lg` avec panier+menu en case de droite ; sur /souscription le rail compact force la marge du header — source unique `rail-inset.ts` pour header/grille/rail (380px).
- **Fenêtre glissante (mobile+desktop)** : `BottomSheet` (sous `lg`, bandeau 80px auto-repliable, glissé doigt) et `TiersDrawer` (à `lg+`, colonne 380px/0, mêmes transitions 540ms) — un geste, deux régimes. Commentaires détaillés en code (`bottom-sheet.tsx`, `tiers-drawer.tsx`, `rail-inset.ts`). `--rail-open` publié sur `documentElement`, fail-open à 1.
- **Panier** : puce ajout cellule voisine du lien (jamais enfant), une région live unique pour annonce, retour visuel + aria couplés. L'ajout lance un vol vers la cible panier VISIBLE du header (`cart/fly-to-cart.tsx` — cibles marquées `cartFlyTarget`, repli sur la bascule du menu mobile fermé) ; décoratif, donc coupé sous reduced-motion, contrairement à `LAYER_MORPH`.
- **Métriques** (reveal, count-up, gauge) : fail-open serveur visible, masquage+animation post-hydratation seulement. `ImpactFrame` optionnel pour synchronisation frame.
- **Constitution graphique** (R1-R8) : ink/paper seul, quatre pops claires, traits orange/orange-text, anneaux focus LIGHT/DARK composables, typo fermée. Commentaires détaillés en code.

## Ubiquitous Language

- **Primitive partagée** : composant serveur (zéro `"use client"`), réutilisable arbre serveur/client — `FramedGrid`, `Button`, `PageHero` (titre + chapeau seuls), `LibelleMosaic` (UNIQUE vue des libellés pour /catalogue, étages triés par rang, arithmétique en `libelle-mosaic-core.ts`, cf. code pour détails), `BookPageFallback` (squelette partagé des `loading.tsx` de fiche livre/boutique), `NewTabMark` (glyphe ↗ + `sr-only` de tout lien `target="_blank"`).

## Decisions

- Les primitives partagées ne fixent que recette visuelle ; padding/taille/disposition restent affaire de l'appelant via `className`. **Exceptions `Container.width` et `Button.display`** : Tailwind v4 reordonne utilitaires par valeur (pas ordre HTML), coupant les overrides naïfs — props à valeurs fermées plutôt que merge. Verrouillé par tests (`button-display.test.tsx`, `getComputedStyle`). **Exception `FramedGrid` flux flex** : `w-fit` d'office — le fond ink n'est que le mortier des filets entre cellules, jamais un remplissage ; pleine largeur, un groupe de quelques puces (filtres actifs, pagination) laissait le reste de la rangée en aplat noir.
