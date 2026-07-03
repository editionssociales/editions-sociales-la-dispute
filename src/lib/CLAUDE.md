# src/lib

## Purpose

Modèle de domaine `Book` et couche data *headless* : lit les deux WordPress + la
boutique WooCommerce, fusionne en catalogue unifié, et expose les dérivations
pures (filtre/tri/facette, pagination, campagne, HTML sûr, formatage).

## Ownership

- **Owns** : le port `CatalogueSource` + ses adaptateurs (http prod, mémoire
  test), le cœur pur de fusion (`catalogue-core`), la façade server-only
  (`catalogue`), l'algèbre de navigation (`browse`), le nettoyage HTML éditorial
  (`cms-html`), les dérivations campagne/navigation/formatage/couverture.
- **Does NOT own** : le rendu des pages (`src/app`) ni les composants de
  présentation (`src/components`) — `cover.tsx` vit ici en exception car il
  encapsule une règle de domaine (ne jamais recadrer une couverture), pas une
  mise en page.

## Local Contracts

- Seuls `catalogue-http.ts` et `boutique.ts` touchent le réseau (`server-only`,
  mémoïsés par requête via `cache()`) ; tout le reste du dossier est pur, sans
  I/O — c'est la surface couverte par les `*.test.ts`.
- `catalogue-core.ts` ne fait ni fetch ni rendu : sa logique se teste
  uniquement à travers le port `CatalogueSource` (adaptateur en mémoire).
- `sanitizeCms` (`cms-html.ts`) est l'unique fabricant de la marque `SafeHtml` ;
  aucun autre module ne doit produire ce type.
- Une page/réponse WordPress ou WooCommerce indisponible dégrade en liste
  partielle ou vide plutôt que de faire planter la page appelante.
- `catalogueHref`/`readFilters` (`browse.ts`) sont l'unique encodeur/décodeur
  d'URL de filtres — pas de reconstruction manuelle de `URLSearchParams`
  ailleurs dans le dossier.

## Work Guidance

- Nouvelle donnée du catalogue : typer la forme brute dans
  `catalogue-source.ts`, transformer dans `catalogue-core.ts` — jamais de fetch
  direct hors `catalogue-http.ts`/`boutique.ts`.
- `catalogue.ts` est le seul point d'entrée consommé par `src/app` ; `browse.ts`
  porte la logique pure (pagination, chips, URL) qu'il enveloppe.
