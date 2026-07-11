# src/app

## Purpose

Surface App Router en deux mondes étanches, sans root layout de tête :
**`(site)/`** — le front public, une route par vue, coquilles fines qui lisent la
façade `src/lib` (`catalogueView`, `getBook`, `getNewReleases`, …) et composent
`src/components` — et **`(payload)/`** — le back-office `/admin` + API Payload,
fichiers générés.

## Ownership

- **Owns** : le découpage des routes, les métadonnées (`metadata` /
  `generateMetadata`), la politique de fraîcheur (statique / ISR / dynamique) des
  routes du front.
- **Does NOT own** : la logique data (`src/lib`), les primitives visuelles
  (`src/components`), ni le contenu des fichiers de `(payload)/` — générés par
  Payload (`pnpm generate:importmap`), à ne jamais éditer à la main.

## Local Contracts

- **Multi-root-layouts** : `(site)/layout.tsx` et `(payload)/layout.tsx` rendent
  chacun leur `<html>` complet ; aucun layout au-dessus des groupes ;
  `favicon.ico` reste à la racine de `app/` (convention metadata). Naviguer entre
  les deux groupes provoque un full page load (attendu — le site ne linke pas
  `/admin`). Aucune collision d'URL entre groupes.
- **Politique de fraîcheur (front)** : pas de `force-dynamic`. Les pages qui lisent
  le catalogue exportent `revalidate = 3600`, alignée sur la fenêtre de cache REST.
  `catalogue` et `catalogue/[edition]` restent dynamiques (elles lisent
  `searchParams`) mais bornent leurs données via `revalidate` ; la fiche livre
  (`generateStaticParams`) et `editions/[slug]` sont pré-rendues puis revalidées
  (ISR) ; accueil, `editions`, `souscription` statiques + ISR ; `a-propos`,
  `rencontres`, `panier` statiques sans donnée externe ; `boutique` redirige vers
  `/catalogue`.
- La fiche livre est la seule route à `dangerouslySetInnerHTML` : HTML éditorial
  typé `SafeHtml` (sanitisé dans `src/lib`) + JSON-LD `Book` sérialisé et échappé
  côté serveur. Aucun autre HTML brut injecté.

## Work Guidance

- Une route front ne contient ni fusion de fonds ni appel réseau direct : toute
  capacité data manquante s'ajoute côté `src/lib`, jamais ici.
- Ne pas réintroduire `force-dynamic` ; garder `revalidate` alignée sur la fenêtre
  de cache REST.

## Verification

- `pnpm build` : les routes statiques/ISR se pré-rendent, `/admin` et `/api`
  restent dynamiques, aucune collision de chemins entre groupes.
