@AGENTS.md

# site — Éditions sociales × La Dispute (site unifié)

## Purpose

Site unique réunissant **Les Éditions sociales**, **La Dispute** et leur **boutique
commune**, en remplacement des trois WordPress OVH. Il ne duplique pas les données : il
**lit** les WordPress (REST + WooCommerce Store API) et les réexpose sous un modèle de
domaine propre (`Book`). La **fusion** des deux catalogues est le cœur du produit.

## Ownership

- **Owns** : le front unifié (App Router), le modèle de domaine (`Book` / statut
  d'achat), la couche data *headless* (port + adaptateurs), la présentation
  brutaliste, la sécurisation du HTML éditorial.
- **Does NOT own** : le contenu (édité dans l'admin WordPress), le paiement
  (WooCommerce, Stripe à venir côté boutique), les médias (servis par OVH pendant
  la migration), la base de données (WordPress reste la source de vérité).

## Local Contracts

- **Lecture seule** vis-à-vis des WordPress : le site ne modifie jamais leur contenu.
- Le **contrat de données WordPress** (CPT `catalogue`, taxonomies `auteur` /
  `collection` / `parution`, champs ACF `isbn` / `prix` / `date_parution` / …) ne
  doit jamais être renommé côté WP — ajouter = OK, renommer/supprimer = casse le site
  (détail : `wp-headless`).
- Un livre n'est **jamais retiré** du catalogue faute d'être en vente : il devient
  « à paraître » ou « indisponible en ligne ».
- Tout HTML éditorial WordPress passe par `sanitizeCms` (marque `SafeHtml`) avant
  rendu — aucune injection brute.
- Classes Tailwind **littérales** partout (le JIT ne compile pas les classes
  assemblées dynamiquement).

## Ubiquitous Language

- **Book** : livre du catalogue unifié (les deux fonds + articles boutique).
- **maison / edition** : `editions-sociales` | `la-dispute`.
- **origin** : `catalogue` (fiche WordPress) | `boutique` (produit WooCommerce seul).
- **PurchaseStatus** : `available` | `external` | `upcoming` | `unavailable`.
- **CatalogueSource** : le *port* de lecture des fonds + produits (cf. `src/lib`).
- **fusion** : assemblage des deux fonds + boutique en une liste de `Book`.

## Decisions

- **Headless via REST + Store API** (et non lecture MySQL directe) : permet la
  **cohabitation sans risque** avec les WordPress en ligne jusqu'au cutover — plan,
  phases et état courant dans `COHABITATION.md`.
- **Ports & adaptateurs** pour le catalogue : cœur pur testable, adaptateur http
  (prod) et adaptateur en mémoire (tests).
- **Fraîcheur par ISR** : les routes rendables statiquement le sont (`revalidate`,
  `generateStaticParams`) ; le cache REST et la page partagent la même fenêtre.

## Work Guidance

- **`@AGENTS.md`** : cette version de Next.js diffère de tes acquis — lis le guide
  concerné dans `node_modules/next/dist/docs/` avant d'écrire du code Next, et
  respecte les avis de dépréciation.
- Ne casse pas le contrat de données WordPress ; préserve le mu-plugin (`wp-headless`).
- Refactor = **iso-rendu** : conserve les chaînes de classes et le DOM produits.
- **Devis / migration / hybrides** : partir de `LEGACY-STACK.md` (inventaire vérifié
  OVH + 4 installs WordPress, source de vérité ; ré-vérifiable via l'API OVH) — ne pas
  refaire la reconnaissance.
- **Chantier accepté (base de données propre, back-office, commerce natif,
  extinction WordPress)** : partir de `IMPLEMENTATION-PROMPT.md` — enchaînement des
  phases restantes, à ne pas re-planifier de zéro à chaque session.

## Verification

- `pnpm typecheck` (tsc) · `pnpm lint` (eslint) · `pnpm test` (vitest).
- `pnpm build` pour vérifier le rendu statique/ISR (les fiches livre pré-rendues).

## Child Index

- **`src/lib`** — modèle de domaine + couche data *headless* : port catalogue, fusion,
  navigation, campagne, sécurisation HTML, formatage.
- **`src/components`** — présentation brutaliste : primitives partagées, cartes /
  grilles, en-tête / pied, carrousel.
- **`src/app`** — App Router : routes, métadonnées, politique de fraîcheur (statique /
  ISR / dynamique).
- **`wp-headless`** — mu-plugin + contrat de données WordPress à préserver.
