@AGENTS.md

# site — Éditions sociales × La Dispute (site unifié)

## Purpose

Site unique réunissant **Les Éditions sociales**, **La Dispute** et leur **boutique
commune**, en remplacement des trois WordPress OVH. Le front **lit** les WordPress
(REST + WooCommerce Store API) et les réexpose sous un modèle de domaine propre
(`Book`) ; la **fusion** des deux catalogues est le cœur du produit. Depuis la
phase 3, l'app embarque aussi le **back-office Payload** (`/admin`) et sa base
Postgres — WordPress reste la **source de vérité** du catalogue jusqu'au swap
(`CATALOGUE_SOURCE=pg`).

## Ownership

- **Owns** : le front unifié (App Router), le modèle de domaine (`Book` / statut
  d'achat), la couche data *headless* (port + adaptateurs), le back-office Payload
  (schéma SQL `payload`, rôles `admin`/`editor`) et la migration
  WordPress→Postgres, la présentation brutaliste, la sécurisation du HTML éditorial.
- **Does NOT own** : le contenu courant (saisi dans WordPress jusqu'au swap —
  Payload = bac à essai, écrasé par chaque delta d'import), le paiement
  (WooCommerce/Paybox ; Stripe à venir), les médias publics (servis par OVH pendant
  la cohabitation), le schéma SQL `public` (réservé — p. ex. dons).

## Local Contracts

- **Lecture seule** vis-à-vis des WordPress : le site ne modifie jamais leur contenu.
- Le **contrat de données WordPress** (CPT `catalogue`, taxonomies `auteur` /
  `collection` / `parution`, champs ACF) ne doit jamais être renommé côté WP —
  ajouter = OK (détail : `wp-headless`).
- Un livre n'est **jamais retiré** du catalogue faute d'être en vente : il devient
  « à paraître » ou « indisponible en ligne ».
- Tout HTML éditorial passe par `sanitizeCms` (marque `SafeHtml`) avant rendu.
- Classes Tailwind **littérales** partout (le JIT ne compile pas les classes
  assemblées dynamiquement).
- **Payload/back-office** : Next et Payload montent **en tandem** (versions épinglées
  ensemble) ; tout script d'écriture Payload passe
  `context.migration`/`context.disableRevalidate` ; URL Neon **poolée** pour l'app et
  les builds, URL **directe** (`DATABASE_URL_UNPOOLED`) réservée à `payload migrate`
  et `pg_dump` ; imports relatifs en **`.ts` explicite** dans tout code chargé par le
  CLI payload (config, collections, scripts) ; scripts `payload run` en
  **top-level await** (le CLI fait `process.exit(0)` dès l'import résolu).

## Ubiquitous Language

- **Book** : livre du catalogue unifié (les deux fonds + articles boutique).
- **maison / edition** : `editions-sociales` | `la-dispute`.
- **origin** : `catalogue` (fiche WordPress) | `boutique` (produit WooCommerce seul).
- **PurchaseStatus** : `available` | `external` | `upcoming` | `unavailable`.
- **CatalogueSource** : le *port* de lecture des fonds + produits (cf. `src/lib`).
- **fusion** : assemblage des deux fonds + boutique en une liste de `Book`.
- **parachute `*LegacyHtml` / `contentTouched`** : le HTML WordPress importé reste
  la source de rendu tant qu'un humain n'a pas réédité la fiche dans Payload.

## Decisions

- **Headless via REST + Store API** (pas de lecture MySQL directe) : cohabitation
  sans risque avec les WordPress jusqu'au cutover — plan et état dans
  `COHABITATION.md`.
- **Ports & adaptateurs** pour le catalogue : cœur pur testable ; adaptateurs http
  (prod) et mémoire (tests), pg à venir derrière le même port.
- **Fraîcheur par ISR** : `revalidate` partagé avec la fenêtre de cache REST.
- **Back-office dans l'app** : Payload 3.x épinglé, schéma Postgres dédié
  `payload`, migrations versionnées (`src/migrations/`), jamais de `push` en prod.

## Work Guidance

- **`@AGENTS.md`** : cette version de Next.js diffère de tes acquis — lire le guide
  concerné dans `node_modules/next/dist/docs/` avant d'écrire du code Next.
- Ne pas casser le contrat WP ; refactor = **iso-rendu** (classes et DOM conservés).
- **Migration / legacy** : partir de `LEGACY-STACK.md` (inventaire vérifié, source de
  vérité). **Chantier accepté** : le plan détaillé (7 phases, stack, calendrier,
  contrats d'interface) est dans `plan/` (entrée : `plan/README.md`) — ne pas
  re-planifier. **Dépôt, CI/CD, comptes, secrets** : `DEVOPS.md` — les runbooks de
  bascule de compte touchent des comptes tiers, jamais sans accord explicite.

## Verification

- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm knip` (exports morts,
  fichiers orphelins, dépendances inutilisées — `knip.json`) — rejoués sur
  chaque PR (`.github/workflows/ci.yml`) ; `pnpm generate:types` après tout
  changement de schéma Payload.
- `pnpm build` : **hors CI à dessein** (~300 requêtes REST vers l'OVH mutualisé —
  le déploiement preview Vercel l'exerce une fois par PR) ; redeviendra hermétique
  au swap pg.
- Migration catalogue : `pnpm migrate:catalogue -- --site=all` doit rester
  **idempotente** (re-run = 0 créé / 0 maj, `contentTouched` = 0).

## Child Index

- **`src/lib`** — modèle de domaine + couche data *headless* (port, fusion,
  sécurisation HTML, formatage).
- **`src/components`** — présentation brutaliste (primitives, cartes, en-tête,
  carrousel).
- **`src/app`** — App Router : `(site)` front + `(payload)` back-office.
- **`src/payload`** — collections + accès du back-office (schéma catalogue, rôles).
- **`src/migrations`** — schéma Postgres versionné (schéma SQL `payload`).
- **`scripts/migrate-catalogue`** — migration WordPress→Postgres, idempotente.
- **`wp-headless`** — mu-plugin + contrat de données WordPress à préserver.
- **`plan`** — plan directeur de la refonte (7 phases, stack, calendrier, devis).
