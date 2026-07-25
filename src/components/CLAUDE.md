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

- **Serveur par défaut** : `"use client"` seulement pour Navigation (`site-header`, `catalogue-filters` et `filter-chips` qu'il rend, `book-tabs` — onglets presse/table des matières de la fiche livre), Carrousels (`nouveautes-carousel`), Métriques (`count-up`, `gauge`, `reveal`), Formulaires (`newsletter-form`, `contact-form`, `submit-button`), Étagères 3D (`shelf-lock`, `shelf-cover`), Feuille de bas d'écran (`bottom-sheet`, sur `hooks/use-media-query`), Panier (`cart/cart-context`, `cart/cart-badge`, `cart/add-to-cart-button`, `cart/clear-cart-on-confirmation`, `cart/goodies-checkout` — suggestions boutique au pied de /panier) — cf. implémentation pour détails des états/effets portés. `nav-accent.ts` reste plat, importable des deux arbres.
- **Couvertures** : toujours via `Cover`/`BookCover` (`src/lib/cover.tsx`), ratio réel.
- **Header mobile (`site-header`)** : sous `lg`, UNE seule rangée — les 4 sections sont derrière une bascule (chevron) qui occupe la case de droite ; déroulé, cette case redevient le panier et la bascule passe en barre pleine largeur sous les sections, chevron retourné. Le compteur d'articles (`CartCountBadge`, `cart/cart-badge`) reste dans cette case droite dans LES DEUX états — il s'affiche donc sur le chevron menu fermé. Aucun changement d'état n'est sec : le panneau reste MONTÉ et sa grille interpole `0fr → 1fr` (item `min-h-0 overflow-hidden`, padding un cran plus bas — sur l'item il survivrait au repli), les deux calques de la case droite se croisent en opacité. Le calque et le panneau repliés sortent du parcours clavier par `inert`, jamais par `visibility` (pas encore focalisable quand le focus SUIT la bascule qui change de place) ; id du panneau par `useId` — le rendu en flux laisse une copie cachée du header, où un id littéral serait dupliqué.
- **Feuille de bas d'écran (`bottom-sheet`)** : sous `lg` seulement, sort une section du flux et l'ancre au bas du viewport — déroulée AU CHARGEMENT, repliable au glissé du doigt sur la poignée (grip) ou à l'appui, en un bandeau-bouton toujours visible. À `lg+` le composant est TRANSPARENT (rend ses enfants sans wrapper : la mise en page desktop de l'appelant, rail sticky compris, est intacte) et le HTML serveur rend la section EN FLUX (fail-open sans JS, cf. Métriques). Deux dettes portées ici : la hauteur du bandeau replié est réservée sur `document.body` (le pied de site vit dans le layout, hors de portée), et les CTA d'ancre de la page (`anchors`) sont interceptés pour redéployer la feuille — sans quoi ils ne montreraient plus rien.
- **Header /souscription (`railInset`, site-header)** : sur cette seule route, la navbar se resserre à gauche (`lg:mr-[380px]`, compact forcé) pour que le rail des contreparties monte jusqu'en haut de page — marge posée sur le `<header>` (jamais le `<nav>`, sa boîte sticky intercepterait les clics du rail), largeur à garder en phase avec la colonne `380px` de `souscription/page.tsx`.
- **Fail-open des Métriques** (`reveal`, `count-up`, via `hooks/use-in-view`) : le HTML serveur est TOUJOURS visible et porte la vraie valeur (bots/no-JS) ; le masquage/l'animation n'arrivent qu'après hydratation (hors viewport seulement), avec repli temporisé si IntersectionObserver ne délivre jamais. Ne jamais réintroduire un état initial `opacity-0`/`0` rendu côté serveur.
- **Constitution graphique (R1-R8, refonte 2026-07 ; épure minimaliste 2026-07)** : R1 ink/paper seul, jamais black/white littéraux (`text-black/70` → `text-ink/70`), `bg-paper-2` seule 3ᵉ teinte • R2 pop-colors (pink/teal/orange/yellow) pour nav/statut seulement (exception actée : bandeaux pop-teal du gabarit /a-propos, maquette client 2026-07) • R3 accents maison (navy=Éditions, brick=Dispute) + sémantique (bottle=succès, ocher=attente, brick=échec) via `lib/accents`, `lib/format` • R4 un seul CTA : `<Button>` (`button.tsx`, variants dont `invert` pour fond ink — recette `INVERT` réutilisée par `SubmitButton`), hover par inversion ink↔paper • R5 deux anneaux focus `FOCUS_RING_*` (`lib/ui.ts`), zéro fait main (exception actée : anneau ocher intérieur des dos de l'étagère 3D /souscription, 20-36px de large — cf. commentaire en code) • R6 typo fermée : `<PageHero>` (titre + chapeau), `text-muted` secondaire, `max-w-[70ch]` prose — jamais de surtitre (« eyebrow ») au-dessus d'un titre, ni d'info de navigation dupliquée (fil d'ariane) : la couverture/le titre portent déjà l'info • R7 tout interactif : hover/focus-visible/active/disabled/pending, cibles `min-h-11`/`h-11 w-11` • R8 brutalisme : aplat shadow `shadow-[8px...]`, zéro radius sauf pointillés `/rencontres`, skeletons = trame réelle.

## Ubiquitous Language

- **Primitive partagée** : composant serveur (zéro `"use client"`), réutilisable arbre serveur/client — `FramedGrid` (grille), `Button` (CTA), `PageHero` (en-têtes page, titre + chapeau seuls), `LibelleMosaic` (l'UNIQUE rendu des libellés pour /catalogue ET /catalogue/[edition], ne jamais la re-inliner — une seule vue depuis l'arbitrage client 25/07 : étages de cases triés par nombre de titres décroissant, chaque métrique décroissant avec le RANG sur sa propre loi — épaisseur en `1/rang`, corps en `1/(rang+1)`, compte en `1/(rang+2)`, pentes ORDONNÉES pour que le texte rapetisse moins vite que la case ne s'aplatit, et le chiffre moins vite encore (il passe devant le libellé en taille, filigrane de sa case) —, bases propres à desktop et mobile, JAMAIS de plancher ni de terme constant ajouté au numérateur — l'un comme l'autre écrase la pente du bas, tout comme un calage sur le nombre de cases plutôt que sur le rang. Étages plafonnés à QUATRE cases, largeur d'une case au prorata du span horizontal de son libellé posé sur 2 lignes — jamais des parts égales ; « Tous les livres » (rang 1) est le seul écart, corps et compte abattus, hauteur libre. Libellé trop long coupé sur une frontière de MOT à l'affichage seulement, nom complet gardé en `sr-only`. Valeurs et rationale dans `tierMetrics` — cibles < 44px assumées sur les étages profonds, entorse R7 actée client 24/07).

## Decisions

- Les primitives partagées ne fixent que la recette visuelle commune ; padding,
  taille et disposition restent l'affaire de l'appelant via `className`, pour ne
  pas figer un contrat de props par usage.
