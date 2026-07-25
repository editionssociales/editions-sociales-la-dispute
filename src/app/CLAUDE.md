# src/app

## Purpose

Surface App Router en deux groupes étanches, sans root layout parent : **`(site)/`** — routes publiques fines (lisent `src/lib`, composent `src/components`) ; **`(payload)/`** — `/admin` + API (générés, à une exception : `custom.scss`, seul point d'entrée CSS manuel de l'admin).

## Ownership

- **Owns** : structuration des routes, métadonnées, politique de fraîcheur (statique/ISR/dynamique).
- **Does NOT own** : logique data (`src/lib`), primitives (`src/components`), contenu Payload (généré).

## Local Contracts

- **Multi-root-layouts** : `(site)/layout.tsx` et `(payload)/layout.tsx` complets indépendants, aucun layout parent. Full page load entre groupes (attendu). Pas de collision d'URL. Sans root layout, pas de 404 racine possible : toute URL hors routes est aspirée par le catch-all `(site)/[...rest]` → `notFound()` → la 404 brandée de `(site)/not-found.tsx`.
- **Métadonnées** : défauts OG/Twitter posés par `(site)/layout.tsx` ; un `openGraph` de page REMPLACE celui du layout (fusion superficielle par champ, pas de deep-merge) — toute page qui le définit doit reposer `siteName`/`locale` (cf. fiche livre). Titres absolus (`{ absolute }`) quand le template dupliquerait le nom du site. Image de partage par convention de fichier `opengraph-image.jpg` (+ `.alt.txt`) colocalisé : og:image/twitter:image générées SANS toucher l'objet `openGraph` hérité (évite le piège de fusion — cf. souscription).
- **Modules colocalisés privés** : une route au rendu volumineux extrait ses sous-arbres en `_components/` (et ses assets en `_dossier/`, préfixe `_` = hors routing) plutôt que de gonfler `src/components` avec du non-réutilisable — précédent : `souscription/_components/{shelf,tiers-rail}.tsx`. Ces modules restent des composants serveur qui suivent les contrats de `src/components` (primitives sans marges d'emplacement : la disposition est l'affaire de l'appelant).
- **Politique de fraîcheur** : pas de `force-dynamic`. Catalogue/routes dynamiques : `revalidate = 3600`. Fiches livre, boutique : ISR. Pages légales, accueil, souscription : statique ou ISR. `/editions/[slug]` : pages de présentation par maison (retour client 2026-07-23, cf. `NAV_HOUSES`) ; `/editions` (index) et `/a-propos` : `permanentRedirect()` vers l'accueil ; `/boutique` (liste) : `permanentRedirect()` vers `/panier` (goodies au checkout, fiches `[slug]` conservées). Détail des pages : voir commentaires dans le code.
- **Injection HTML** : `dangerouslySetInnerHTML` accepte uniquement `SafeHtml` (sanitisé `src/lib`) — fiches livre, boutique, pages légales. Champ vide = fallback JSX.

## Work Guidance

- Une route front ne fusionne pas de données ni n'appelle le réseau : toute capacité manquante va en `src/lib`.

## Verification

- `pnpm build` : statique/ISR pré-rendus, `/admin` et `/api` dynamiques, aucune collision entre groupes.
