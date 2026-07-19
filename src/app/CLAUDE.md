# src/app

## Purpose

Surface App Router en deux groupes étanches, sans root layout parent : **`(site)/`** — routes publiques fines (lisent `src/lib`, composent `src/components`) ; **`(payload)/`** — `/admin` + API (générés, à une exception : `custom.scss`, seul point d'entrée CSS manuel de l'admin).

## Ownership

- **Owns** : structuration des routes, métadonnées, politique de fraîcheur (statique/ISR/dynamique).
- **Does NOT own** : logique data (`src/lib`), primitives (`src/components`), contenu Payload (généré).

## Local Contracts

- **Multi-root-layouts** : `(site)/layout.tsx` et `(payload)/layout.tsx` complets indépendants, aucun layout parent. Full page load entre groupes (attendu). Pas de collision d'URL.
- **Politique de fraîcheur** : pas de `force-dynamic`. Catalogue/routes dynamiques : `revalidate = 3600`. Fiches livre, éditions, boutique : ISR. Pages légales, a-propos, accueil, souscription : statique ou ISR. Détail des pages : voir commentaires dans le code.
- **Injection HTML** : `dangerouslySetInnerHTML` accepte uniquement `SafeHtml` (sanitisé `src/lib`) — fiches livre, boutique, pages légales, a-propos. Champ vide = fallback JSX.

## Work Guidance

- Une route front ne fusionne pas de données ni n'appelle le réseau : toute capacité manquante va en `src/lib`.

## Verification

- `pnpm build` : statique/ISR pré-rendus, `/admin` et `/api` dynamiques, aucune collision entre groupes.
