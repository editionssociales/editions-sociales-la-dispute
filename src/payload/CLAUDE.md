# src/payload

## Purpose

Le back-office Payload monté dans l'app (schéma Postgres dédié `payload`) : collections + globals, rôles/accès, hooks de revalidation à l'édition, et une surface admin custom (dashboard `/admin` allégé, vues `/admin/stock` · `/admin/sante`, chips de filtre livres) au-dessus du CRUD généré. Cœurs purs et endpoints custom vivent dans `lib/`.

## Ownership

- **Owns** : la config des collections/globals, les policies d'accès (`access.ts` : `admin`|`editor`), les composants admin custom (`Dashboard.tsx`, `StockPage.tsx`, `HealthPage.tsx`, chips livres, champ slug), les endpoints custom et leurs cœurs purs dans `lib/`.
- **Does NOT own** : le modèle de domaine ni les seams de lecture du front (`src/lib`), les pages (`src/app`), la présentation (`src/components`).

## Local Contracts

- Dépendance à sens unique : ce dossier importe parfois `src/lib` (`donation-tiers`, `promo-core`, `order-export`, `cart-quote` en type-only) ; `src/lib` n'importe jamais `src/payload` — seule la Local API (`getPayload`) relie les deux côtés.
- Toute écriture automatisée (import stock routeur, migration) pose `context.migration` et/ou `context.disableRevalidate` ; une écriture humaine ne pose jamais ces flags — c'est ce qui distingue les deux au niveau des hooks (`setContentTouched`, `revalidateCatalogueAfterChange`).
- Endpoints custom gardés par `access.ts` (`isAdmin`/`isAdminOrEditor`) en tête de handler, avant tout I/O : `import-stock`, `export/preparation`, `export/compta`, `import-runs/:id/rapport`. Tout le reste (ex. désactivation d'un code promo depuis le dashboard) passe par le REST généré de la collection, sous sa propre `access`.
- Dashboard (`derive.ts`) : jamais de vert par défaut — un signal non calculable est `na` (gris), jamais `ok`.
- `Orders` : `create` fermé partout (seul le webhook Stripe écrit, Local API `overrideAccess`) ; tous les champs sont verrouillés en écriture après création sauf `status` (`lockedAfterCreate`).
- Découpage cœur pur (testé, sans I/O) + orchestration I/O dans `lib/` — jumeaux `*-core.ts` pour `stock-import` et `import-run-report` ; le cœur pur d'`order-export-handler` vit dans `src/lib/order-export.ts`.
- Nav admin = ordre de déclaration dans `payload.config.ts` (tableau `collections` puis `globals`, un global rejoint le groupe existant à sa suite) ; groupes cibles : Quotidien (Livres, Commandes) · Catalogue (Auteur·rice·s, Libellés, Médias) · Boutique (Codes promo, Imports routeur, Réglages boutique) · Site (Mises en avant, Page À propos, Page Souscription, Pages) · Administration (Utilisateur·rice·s).

## Verification

- `pnpm generate:types` après tout changement de schéma (collections/globals/fields) — `access.ts` le signale : tant que `payload-types.ts` n'est pas généré, les comparaisons de rôle ne sont pas vérifiées par le compilateur.
- Migrations versionnées, jamais de `push` en prod (cf. CLAUDE.md racine).
