@AGENTS.md

# site — Éditions sociales × La Dispute (site unifié)

## Purpose

Site unique réunissant **Les Éditions sociales**, **La Dispute** et leur **boutique commune** en un front headless (REST + Store API → modèle `Book`), avec Payload (`/admin`) et un moteur de **commerce natif** (`COMMERCE_NATIVE`) embarqués. Bascule catalogue pg + commerce natif + DNS en une fenêtre unique — calendrier : `plan/02-mise-en-production.md`.

## Ownership

Owns : le front unifié, le modèle de domaine (`Book` / statut d'achat), la couche data *headless* (port + adaptateurs), le back-office Payload (schéma `payload`, rôles), la migration WordPress→Postgres, le moteur de commerce natif (port en centimes, panier, checkout, export) sous `COMMERCE_NATIVE`, la présentation brutaliste, la sécurisation du HTML éditorial.
Does NOT own : le contenu, la vente et les médias — tous trois côté WordPress/WooCommerce jusqu'à la bascule (Payload = bac à essai ; commerce natif codé mais inerte si `COMMERCE_NATIVE=0`) ; le schéma SQL `public` (réservé — p. ex. dons).

## Local Contracts

- **Lecture seule** vis-à-vis des WordPress (jamais d'écriture) ; leur contrat de données (CPT `catalogue`, taxonomies `auteur`/`collection`/`parution`, champs ACF) ne doit jamais être renommé côté WP — ajouter = OK (détail : `wp-headless`).
- Un livre n'est **jamais retiré** du catalogue faute d'être en vente (« à paraître » ou « indisponible en ligne ») ; tout HTML éditorial passe par `sanitizeCms` (marque `SafeHtml`) ; classes Tailwind **littérales** partout (le JIT ne compile pas le dynamique).
- **Payload** : Next et Payload montent **en tandem** (versions épinglées) ; écritures via `context.migration`/`context.disableRevalidate` ; URL Neon **poolée** (app/build) vs **directe** `DATABASE_URL_UNPOOLED` (`payload migrate`, `pg_dump`) ; imports `.ts` explicites sous le CLI payload ; scripts `payload run` en **top-level await**.
- **`COMMERCE_NATIVE`** : `0` (défaut) = iso-rendu strict (Woo intact, `/boutique`→`/catalogue`, panier placeholder, checkout `503`) ; `1` = panier/checkout/port natifs, plus aucun appel Store API — montants **toujours en centimes entiers**.
- **Stock** : champ unique `stock` (nullable, livres ET boutique-seuls), `stockSuivi` `routeur`|`manuel` ; le stock EST la disponibilité ; décrément au paiement **idempotent** ; `upcoming` **prime toujours**.

## Ubiquitous Language

- **Book** : livre du catalogue unifié (deux fonds + boutique). **maison/edition** : `editions-sociales`|`la-dispute`. **origin** : `catalogue` (WP) | `boutique` (Woo seul). **PurchaseStatus** : `available`|`external`|`upcoming`|`unavailable`.
- **CatalogueSource** : port de lecture des fonds + produits (`src/lib`). **fusion** : assemblage des deux fonds + boutique en une liste `Book`.
- **parachute `*LegacyHtml`/`contentTouched`** : le HTML WordPress fait foi tant qu'un humain n'a pas réédité la fiche dans Payload.
- **`COMMERCE_NATIVE`** / **`stockSuivi`** / **routeur** : cf. Local Contracts ci-dessus (interrupteur de vente, origine du stock, distributeur mensuel).

## Decisions

- **Bascule unique big-bang** (remplace la cohabitation phasée envisagée initialement) : contenu, catalogue, commerce et DNS en une seule fenêtre — détail : `plan/02-mise-en-production.md`.
- **Headless via REST + Store API** (pas de MySQL direct) : cohabitation sans risque jusqu'au cutover — `COHABITATION.md`.
- **Ports & adaptateurs** : cœur pur testable, adaptateurs http (WordPress) / pg (Payload) / mémoire (tests) derrière le même port.
- **Fraîcheur par ISR** : `revalidate` partagé avec le cache REST. **Back-office dans l'app** : Payload 3.x épinglé, schéma Postgres dédié `payload`, migrations versionnées, jamais de `push` en prod.

## Work Guidance

- **`@AGENTS.md`** : cette version de Next.js diffère de tes acquis — lire `node_modules/next/dist/docs/` avant d'écrire du code Next.
- Ne pas casser le contrat WP ; refactor = **iso-rendu** (classes/DOM conservés).
- **Migration/legacy** : `LEGACY-STACK.md` (inventaire vérifié) ; plan détaillé dans `plan/README.md` (entrée complète du plan) — ne pas re-planifier. **Dépôt, CI/CD, comptes, secrets** : `DEVOPS.md` — bascules de compte jamais sans accord explicite.
- **Opérations & pérennité** : `OPERATIONS.md` (runbook d'exploitation, monitoring/alertes) et `REVERSIBILITE.md` (dossier de réversibilité, escape routes de la stack) — à lire avant Jour J.

## Verification

- `pnpm typecheck` · `lint` · `test` · `knip` (exports/fichiers/dépendances morts) — rejoués sur chaque PR ; `pnpm generate:types` après tout changement de schéma Payload.
- `pnpm build` : **hors CI à dessein** (~300 requêtes REST OVH ; exercé une fois par PR par le preview Vercel) — redeviendra hermétique à la bascule (`CATALOGUE_SOURCE=pg` en production).
- `pnpm migrate:catalogue -- --site=all` doit rester **idempotent** (re-run = 0 créé / 0 maj, `contentTouched` = 0).

## Child Index

- **`src/lib`** — modèle de domaine + couche data *headless*.
- **`src/components`** — présentation brutaliste.
- **`src/app`** — App Router : `(site)` front + `(payload)` back-office.
- **`src/payload`** — collections + accès du back-office.
- **`src/migrations`** — schéma Postgres versionné (schéma SQL `payload`).
- **`scripts/migrate-catalogue`**, **`scripts/migrate-products.ts`** — migrations WordPress/WooCommerce→Postgres, idempotentes ; **`scripts/newsletter-export.mjs`**, **`scripts/newsletter-import.mjs`** — export/import Brevo ; **`scripts/backup-prune.mjs`**, **`scripts/build-product-redirects.ts`** — maintenance.
- **`wp-headless`** — contrat de données WordPress à préserver.
- **`plan`** — plan directeur de la refonte (7 phases, stack, calendrier, devis).
- **`.github/workflows/backup-db.yml`** — sauvegarde nocturne chiffrée Neon→Blob.
- **`docs/BACK-OFFICE.md`** — guide d'utilisation du back-office pour l'équipe éditoriale.
- **`OPERATIONS.md`** — runbook d'exploitation (monitoring, alertes, sauvegarde).
- **`REVERSIBILITE.md`** — dossier de réversibilité (escape routes WordPress/Postgres/stack).
