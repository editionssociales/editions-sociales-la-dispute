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
  `useInView`, `src/hooks/use-in-view`), `newsletter-form` / `contact-form`
  (soumission via server action, gestion d'état de formulaire), `shelf-lock` /
  `shelf-cover` (étagère 3D du héro : exclusion d'ouverture entre livres, ratio
  réel de couverture), `cart/cart-context` (état global du panier — Context +
  `localStorage`, monté par le layout `(site)` sur tout le site),
  `cart/cart-badge` (compteur dans `site-header`), `cart/add-to-cart-button`
  (handler d'ajout, rendu par `buy-links`/`book-card`), `cart/clear-cart-on-confirmation`
  (vide le panier à l'arrivée sur `/merci`, effet gardé derrière `ready` pour
  ne pas courir devant l'hydratation du provider) et `submit-button`
  (état `pending` d'une server action via `useFormStatus` — doit vivre sous le
  `<form>`, jamais l'englober). Tout le reste est composant serveur — dont
  `cart/shelf-spines` (décor de l'état vide du panier, sans état propre).
- Les couvertures passent toujours par `Cover` / `BookCover` (`src/lib/cover.tsx`) :
  jamais recadrées, au ratio réel de l'image.
- **Constitution graphique (R1-R8, refonte design front 2026-07)** — invariants
  de tout composant de présentation, plus de dérive possible :
  - **R1** ink/paper : jamais `bg-black`/`text-black`/`border-black`/`bg-white`/
    `text-white` littéraux (opacités comprises, `text-black/70` → `text-ink/70`)
    — toujours `ink`/`paper`. `bg-paper-2` reste la seule 3ᵉ teinte claire.
    Exception : `text-black` sur aplat pop (contraste voulu par la maquette).
  - **R2** pop (`pop-pink`/`pop-teal`/`pop-orange`/`pop-yellow`) = langage de
    nav/statut, rien d'autre — cellules de nav (`site-header`, `nav-accent.ts`),
    badge « À paraître », anneau de focus sombre (`FOCUS_RING_DARK`). Jamais en
    fond de bandeau promo, jamais cyclé par index.
  - **R3** accents = maison + sémantique (`lib/accents`, `lib/format`) : navy =
    Éditions sociales, brick = La Dispute ; bottle = succès, ocher = en
    attente, brick = échec — même code sur toutes les pages d'issue (merci,
    souscription, panier, formulaires).
  - **R4** un seul CTA : `<Button>` (`button.tsx`). Hover canonique = inversion
    ink↔paper (SOLID/OUTLINE) ; les hovers pop restent l'apanage du quadrillage
    de nav, jamais des CTA de page.
  - **R5** deux anneaux de focus, zéro focus fait main : `FOCUS_RING_LIGHT`/
    `_LIGHT_OUTER` (`lib/ui.ts`) sur fond clair/pop, `FOCUS_RING_DARK`/
    `_DARK_OUTER` sur fond ink.
  - **R6** échelle typo fermée : `<PageHero tone="content"|"system"|"cover">`
    pour les h1 de page (404 = seule exception bespoke), `<Eyebrow variant="lg"|"sm" dot>`
    pour les eyebrows. Texte secondaire en `text-muted` (jamais `text-black/50`).
    Mesure de lecture `max-w-[70ch]` sur tout corps de texte (`.prose-book`,
    pages légales).
  - **R7** chaque interactif a hover + focus-visible + active + disabled +
    pending (`aria-busy`) ; cibles `min-h-11`/`h-11 w-11` sur tout contrôle
    manipulé (stepper, chips, nav compacte, pagination).
  - **R8** brutalisme jusqu'au bout : zéro ombre floue (aplat décalé
    `shadow-[8px_8px_0_0_#17140f]` ou bordure `border-2 border-ink`), zéro
    `border-radius` (dont `.prose-book img`) — seule exception nommée :
    bordures pointillées de l'état « à venir » de `/rencontres`. Les skeletons
    reproduisent la trame réelle (`FramedGrid`, gap 2px), jamais une grille
    improvisée.

## Ubiquitous Language

- **Primitive partagée** : composant plat, sans `"use client"`, utilisable aussi
  bien dans un arbre serveur que client — `FramedGrid` (recette de la grille
  encadrée, hairline noir), `Breadcrumb` (fil d'ariane ; porte sa propre marge
  `mb-6`, `tone="light"|"dark"` selon le fond de la page, et
  `currentIsPage={false}` pour les fiches produit dont le fil s'arrête à la
  collection — la dernière miette redevient alors un lien), `Button` (recette
  CTA couleur/bordure/hover/focus, états `disabled` inclus), `PageHero`
  (en-tête de page : eyebrow/titre/chapeau, échelle fermée par `tone`).

## Decisions

- Les primitives partagées ne fixent que la recette visuelle commune ; padding,
  taille et disposition restent l'affaire de l'appelant via `className`, pour ne
  pas figer un contrat de props par usage.
