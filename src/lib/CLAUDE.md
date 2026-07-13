# src/lib

## Purpose

Modèle de domaine `Book` et couche data *headless* : lit les deux WordPress + la
boutique WooCommerce (ou Payload, `CATALOGUE_SOURCE=pg`), fusionne en catalogue
unifié, et expose les dérivations pures (filtre/tri/facette, pagination,
campagne, HTML sûr, formatage). Porte aussi le moteur de **commerce natif** —
port, panier, checkout, export commandes — actif derrière `COMMERCE_NATIVE`
(cf. `env.ts`) ; tant que le flag est à `0`, ces modules existent mais ne sont
appelés par aucune route.

## Ownership

- **Owns** : le port `CatalogueSource` (forme brute **neutre** `RawBook`) + ses
  adaptateurs (http prod via le mapper pur `catalogue-wp-map`, pg via
  `catalogue-pg-map`, mémoire test), le cœur pur de fusion (`catalogue-core`) —
  dont la résolution `PurchaseStatus` stock-aware (`resolveNativePurchase`) :
  `upcoming` prime toujours sur le stock, un stock `null` retombe sur
  `sellable` (suivi absent = disponible) —, la façade server-only
  (`catalogue`), l'algèbre de navigation (`browse`), la pagination résiliente
  (`fetch-all-pages`), le nettoyage HTML éditorial (`cms-html`), la forme des
  variables d'env et l'interrupteur `COMMERCE_NATIVE` (`env`), les dérivations
  campagne/navigation/formatage/couverture, et le moteur de commerce natif :
  port pur en centimes (`shipping-core`), panier (`cart-core`/`cart-source`),
  checkout (`checkout-core`/`checkout-source`), assemblage commande côté
  webhook (`order-webhook-core`), export CSV commandes (`order-export`),
  interface email de commande (`order-mail`).
- **Does NOT own** : le rendu des pages (`src/app`) ni les composants de
  présentation (`src/components`) — `cover.tsx` vit ici en exception car il
  encapsule une règle de domaine (ne jamais recadrer une couverture), pas une
  mise en page ; ni les collections/hooks Payload (`src/payload`), ni
  l'orchestration I/O des routes commerce (`src/app/api/checkout`,
  `src/app/api/stripe/webhook`) — ce dossier ne fournit que le calcul pur et
  les adaptateurs de lecture qu'elles composent.

## Local Contracts

- Seuls `catalogue-http.ts`, `boutique.ts` et `donations.ts` touchent le réseau
  (`server-only`, mémoïsés par requête via `cache()`) ; le reste du dossier vise
  à être pur, sans I/O, sauf les exceptions **back-office/commerce**, toutes
  `server-only` et lisant Postgres via la Local API Payload (pas de `fetch`),
  sans mémoïsation `cache()` (`getPayload({config})` déjà mémoïsé côté Payload,
  singleton par process) : `catalogue-pg.ts`/`highlight.ts` (E4/E6bis),
  `site-content.ts` (globals « Contenus du site » — fallback intégral sur
  les textes en dur, fusion pure dans `site-content-core.ts`, testée), et
  depuis le commerce natif `cart-source.ts` (flag `reducedShippingFlag` par
  lot d'ids) et `checkout-source.ts` (relecture livres/promo pour la
  re-validation serveur) — ces deux derniers SÉPARÉS du port `CatalogueSource`
  à dessein, pour ne pas élargir `CommerceInfo` et casser les fixtures
  `catalogue-pg-map.test.ts`/`catalogue-core.test.ts` existantes. `stripe.ts`
  est `server-only` sans réseau (instanciation paresseuse du client). Le reste
  du dossier (`catalogue-core`, `catalogue-pg-map`, `browse`, `cms-html`,
  `typo-fr`, `format`, `donation-tiers`, `donations-core`, `shipping-core`,
  `cart-core`, `checkout-core`, `order-webhook-core`, `order-export`,
  `order-mail`…) reste pur, sans I/O — c'est la surface couverte par les
  `*.test.ts`. **Piège vérifié** : le marqueur `server-only` jette dès son
  import hors d'un build Next (dont sous Vitest) — un module `server-only`, ou
  tout module qui en importe un transitivement, ne peut donc pas être testé
  directement ; d'où le découpage `donations.ts` (I/O) / `donations-core.ts`
  (agrégation + parsing, pur, testé), même logique que
  `catalogue-http.ts`/`catalogue-core.ts`.
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
- Nouvelle règle de vente (port, promo, stock) : le cœur pur va dans un module
  dédié (`shipping-core.ts` ; `promo-eval-core.ts` vit côté `src/payload/lib`,
  pas ici) testé sans Payload ; la lecture Payload que ce cœur nécessite vit
  dans une source dédiée (`cart-source.ts`, `checkout-source.ts`) plutôt que
  dans `catalogue-pg.ts`, pour ne pas élargir `CommerceInfo`/`RawBook` et
  casser les fixtures du port existant.
