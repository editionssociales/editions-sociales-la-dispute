# src/lib

## Purpose

Modèle de domaine `Book` et couche data *headless* : lit les deux WordPress + la
boutique WooCommerce, fusionne en catalogue unifié, et expose les dérivations
pures (filtre/tri/facette, pagination, campagne, HTML sûr, formatage).

## Ownership

- **Owns** : le port `CatalogueSource` (forme brute **neutre** `RawBook`) + ses
  adaptateurs (http prod via le mapper pur `catalogue-wp-map`, pg via
  `catalogue-pg-map`, mémoire test), le cœur pur de fusion (`catalogue-core`),
  la façade server-only (`catalogue`), l'algèbre de navigation (`browse`), la
  pagination résiliente (`fetch-all-pages`), le nettoyage HTML éditorial
  (`cms-html`), la forme des variables d'env (`env`), les dérivations
  campagne/navigation/formatage/couverture.
- **Does NOT own** : le rendu des pages (`src/app`) ni les composants de
  présentation (`src/components`) — `cover.tsx` vit ici en exception car il
  encapsule une règle de domaine (ne jamais recadrer une couverture), pas une
  mise en page.

## Local Contracts

- Seuls `catalogue-http.ts`, `boutique.ts` et `donations.ts` touchent le réseau
  (`server-only`, mémoïsés par requête via `cache()`) ; le reste du dossier vise
  à être pur, sans I/O, sauf deux exceptions **back-office** (E4/E6bis) :
  `catalogue-pg.ts` et `highlight.ts` sont `server-only` et lisent Postgres via
  la Local API Payload (pas de `fetch`), sans mémoïsation `cache()` —
  `getPayload({config})` est déjà mémoïsé côté Payload (singleton par process).
  `stripe.ts` est `server-only` sans réseau (instanciation paresseuse du
  client). Le reste du dossier (`catalogue-core`, `catalogue-pg-map`, `browse`,
  `cms-html`, `typo-fr`, `format`, `donation-tiers`, `donations-core`…) reste
  pur, sans I/O — c'est la surface couverte par les `*.test.ts`. **Piège
  vérifié** : le marqueur `server-only` jette dès son import hors d'un build
  Next (dont sous Vitest) — un module `server-only`, ou tout module qui en
  importe un transitivement, ne peut donc pas être testé directement ; d'où le
  découpage `donations.ts` (I/O) / `donations-core.ts` (agrégation + parsing,
  pur, testé), même logique que `catalogue-http.ts`/`catalogue-core.ts`.
  **Depuis le candidat 1 du rapport d'architecture (12/07)** : vitest résout
  l'alias `server-only` → export react-server vide (`vitest.config.ts`), la
  couche de composition se teste donc AUSSI directement, réseau intercepté par
  msw (`catalogue-http.test.ts`, `souscription/actions.test.ts`,
  `api/stripe/webhook/route.test.ts`) — le découpage pur/I-O reste la règle
  pour la logique, l'alias sert aux contrats d'intégration (dégradation,
  metadata Stripe, signatures).
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

- Nouvelle donnée du catalogue : étendre la forme neutre `RawBook`
  (`catalogue-source.ts`) et chaque mapper d'adaptateur (`catalogue-wp-map.ts`
  pour le dialecte WP — entités, `Nom/Prénom`, chaînes ACF sales, rebase
  cms-* ; `catalogue-pg-map.ts` pour Payload) ; `catalogue-core.ts` ne voit
  jamais un dialecte de source — jamais de fetch direct hors
  `catalogue-http.ts`/`boutique.ts`.
- `catalogue.ts` est le seul point d'entrée consommé par `src/app` ; `browse.ts`
  porte la logique pure (pagination, chips, URL) qu'il enveloppe.
