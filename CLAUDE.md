@AGENTS.md

# site — Éditions sociales × La Dispute (site unifié)

## Purpose

Site unique réunissant **Les Éditions sociales**, **La Dispute** et leur **boutique commune** : front Next.js + back-office Payload (`/admin`) + commerce natif (panier, checkout Stripe, commandes), le tout sur une seule source — Postgres (Neon, schéma `payload`). Coupure OVH actée : plus aucun WordPress/WooCommerce lu, le fonctionnement actuel est le fonctionnement final.

## Ownership

Owns : le front unifié, le modèle de domaine (`Book` / statut d'achat), la couche data (port + adaptateurs pg/mémoire), le back-office Payload (schéma `payload`, rôles), le moteur de commerce natif (port en centimes, panier, checkout, export), la présentation brutaliste, la sécurisation du HTML éditorial.
Does NOT own : le schéma SQL `public` (réservé — p. ex. dons) ; la jauge de dons (calculée depuis les charges Stripe, zéro stockage).

## Local Contracts

- Un livre n'est **jamais retiré** du catalogue faute d'être en vente (« à paraître » ou « indisponible en ligne ») ; tout HTML éditorial passe par `sanitizeCms` (marque `SafeHtml`) ; classes Tailwind **littérales** partout (le JIT ne compile pas le dynamique).
- **Payload** : Next et Payload montent **en tandem** (versions épinglées) ; écritures via `context.migration`/`context.disableRevalidate` ; URL Neon **poolée** (app/build) vs **directe** `DATABASE_URL_UNPOOLED` (`payload migrate`, `pg_dump`) ; imports `.ts` explicites sous le CLI payload ; scripts `payload run` en **top-level await**. `DATABASE_URL` + `PAYLOAD_SECRET` REQUISES au boot (`env.ts`).
- **Commerce** : montants **toujours en centimes entiers** ; checkout = re-validation serveur intégrale (jamais un prix client) ; l'I/O Payload du parcours d'achat passe par les seams `commerce-source`/`order-source`.
- **Stock** : champ unique `stock` (nullable, livres ET boutique-seuls), `stockSuivi` `routeur`|`manuel` ; le stock EST la disponibilité ; décrément au paiement **idempotent** ; `upcoming` **prime toujours** — règle énoncée une seule fois : `src/lib/sellability.ts`.

## Ubiquitous Language

- **Book** : livre du catalogue unifié (deux fonds + boutique). **maison/edition** : `editions-sociales`|`la-dispute`. **origin** : `catalogue` (fonds) | `boutique` (article boutique-seul). **PurchaseStatus** : `available`|`external`|`upcoming`|`unavailable`.
- **CatalogueSource** : port de lecture des fonds (`src/lib`) — adaptateurs pg (Payload) et mémoire (tests).
- **parachute `*LegacyHtml`/`contentTouched`** : le HTML hérité de WordPress fait foi tant qu'un humain n'a pas réédité la fiche dans Payload. Ces champs sont **lisibles publiquement** (la lecture front garde `overrideAccess: false` — un champ réservé aux connectés serait invisible du rendu) ; TOUTE écriture humaine, API REST comprise, pose `contentTouched=true`.
- **`stockSuivi`** / **routeur** : origine du stock (import mensuel du distributeur vs saisie manuelle).

## Decisions

- **Coupure OVH brute** (2026-07-18, remplace la bascule fenêtrée du plan) : l'axe WordPress/WooCommerce (adaptateur http, Store API, flags `CATALOGUE_SOURCE`/`COMMERCE_NATIVE`, scripts de migration, rewrites `wc-api`, redirects `cms-*`) est supprimé du code — pg + commerce natif sont le seul chemin. Historique : `plan/`, `LEGACY-STACK.md`, `REVERSIBILITE.md`.
- **Ports & adaptateurs** : cœur pur testable, adaptateurs pg (Payload) / mémoire (tests) derrière le même port.
- **Fraîcheur par ISR** (`revalidate = 3600` sur le catalogue) ; à l'édition back-office, les hooks purgent en **chemins littéraux** + `revalidateTag(…, { expire: 0 })` (read-your-writes) — les motifs `revalidatePath` avec groupe de routes ou segment dynamique sont inopérants sur Vercel (constat live 2026-07-19, `src/payload/hooks/revalidate.ts`). **Back-office dans l'app** : Payload 3.x épinglé, schéma Postgres dédié `payload`, migrations versionnées, jamais de `push` en prod.

## Work Guidance

- **`@AGENTS.md`** : cette version de Next.js diffère de tes acquis — lire `node_modules/next/dist/docs/` avant d'écrire du code Next.
- **Dépôt, CI/CD, comptes, secrets** : `DEVOPS.md` — bascules de compte jamais sans accord explicite. **Opérations** : `OPERATIONS.md` (runbook, monitoring/alertes).
- `plan/`, `LEGACY-STACK.md`, `REVERSIBILITE.md` : documents d'époque de la refonte — historiques, ne plus s'y référer pour l'état courant.

## Verification

- `pnpm typecheck` · `lint` · `test` · `knip` (exports/fichiers/dépendances morts) — rejoués sur chaque PR ; `pnpm generate:types` après tout changement de schéma Payload.
- `pnpm build` : hermétique (Postgres uniquement) — exercé par le preview Vercel à chaque PR.

## Child Index

- **`src/lib`** — modèle de domaine + couche data.
- **`src/components`** — présentation brutaliste.
- **`src/app`** — App Router : `(site)` front + `(payload)` back-office.
- **`src/payload`** — collections, accès et surface admin du back-office (dashboard, vues `/admin/stock` · `/admin/sante`, cœurs purs + endpoints dans `lib/`).
