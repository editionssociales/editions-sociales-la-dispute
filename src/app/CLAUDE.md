# src/app

## Purpose

Surface App Router : une route par vue, chaque page une coquille fine qui lit le
catalogue via la façade `src/lib` (`catalogueView`, `getBook`, `getBooks`,
`getNewReleases`, `countBooks`, `getAllBookParams`, …) et compose les primitives de
`src/components`. Aucune logique de fusion ni d'accès WordPress direct ici.

## Ownership

- **Owns** : le découpage des routes, les métadonnées (`metadata` /
  `generateMetadata`), et la politique de fraîcheur (statique / ISR / dynamique) de
  chaque route.
- **Does NOT own** : la logique data (`src/lib`) ni les primitives visuelles
  (`src/components`) — cette arborescence assemble les deux, sans dupliquer leur rôle.

## Local Contracts

- **Politique de fraîcheur** : `force-dynamic` a été retiré de toutes les routes. Les
  pages qui lisent le catalogue exportent `revalidate = 3600`, alignée sur la fenêtre
  de cache REST. `catalogue` et `catalogue/[edition]` restent rendues dynamiquement
  (elles lisent `searchParams`) mais bornent quand même la fraîcheur de leurs données
  via `revalidate`. La fiche livre (`catalogue/[edition]/[slug]`, via
  `generateStaticParams`) et `editions/[slug]` sont pré-rendues statiquement puis
  revalidées (ISR) ; `page` (accueil), `editions` et `souscription` sont statiques +
  ISR. `a-propos`, `rencontres` et `panier` n'ont aucune donnée externe et restent
  statiques par défaut, sans `revalidate`. `boutique` est une redirection vers
  `/catalogue`.
- La fiche livre est la seule route à injecter via `dangerouslySetInnerHTML` :
  le HTML éditorial (uniquement depuis des champs typés `SafeHtml`, sanitisés en amont
  dans `src/lib`) et un script JSON-LD `Book` (schema.org) sérialisé et échappé côté
  serveur — donnée structurée SEO, pas du HTML éditorial. Aucun autre HTML brut n'est
  injecté ailleurs dans l'arborescence.

## Work Guidance

- Une route ne doit contenir ni fusion de fonds ni appel réseau direct : toute
  capacité data manquante s'ajoute côté `src/lib`, jamais ici.
- Ne pas réintroduire `force-dynamic` ; garder `revalidate` alignée si la fenêtre de
  cache REST change.

## Verification

- `pnpm build` pour vérifier que les routes statiques/ISR se pré-rendent (fiches
  livre, éditions) et que les routes dynamiques restent dynamiques.
