# Éditions sociales · La Dispute — site unifié

Squelette du **site unique** réunissant les deux maisons d'édition **Les Éditions
sociales** et **La Dispute** ainsi que leur **boutique commune**, en remplacement
des trois WordPress historiques hébergés chez OVH.

Stack : **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind
CSS v4** · **mysql2**.

## Principe : réutiliser les bases OVH

Le site ne duplique pas les données : il **lit directement les bases MySQL** des
sites WordPress d'origine et les expose sous un modèle de domaine propre
(`Book`, `Product`…), indépendant de WordPress.

| Source     | Base OVH       | Préfixe   | Contenu                                                          |
| ---------- | -------------- | --------- | --------------------------------------------------------------- |
| `es`       | `editionskes`  | `es_`     | Catalogue Éditions sociales (CPT `catalogue` + ACF) — 117 livres |
| `ld`       | `editionsk712` | `es_`     | Catalogue La Dispute — 176 livres                               |
| `boutique` | `editionsk884` | `mod973_` | Boutique WooCommerce — 223 produits                             |

Les deux catalogues partagent la même structure (CPT `catalogue`, taxonomies
`auteur` / `collection` / `parution`, champs ACF `isbn`, `prix`,
`date_parution`, `nombre_pages`, liens d'achat). La couche `src/lib/catalogue.ts`
assemble un `Book` unifié à partir de ces tables, en taguant chaque titre par
maison d'édition — c'est le cœur de la **fusion**.

## Architecture

```
src/
  lib/
    db.ts            Pools mysql2 par source (config via variables d'env)
    types.ts         Modèle de domaine unifié
    editions.ts      Métadonnées des deux maisons
    catalogue.ts     Repository catalogue (ES + La Dispute fusionnés)
    boutique.ts      Repository WooCommerce (lecture)
    format.ts        Helpers (auteur « Nom/Prénom », dates AAAAMMJJ, prix…)
    parse-filters.ts Parsing des filtres d'URL
  components/        Header, footer, carte livre, grille, filtres, badges…
  app/
    page.tsx                          Accueil (héro fusion + nouveautés)
    catalogue/                        Catalogue commun + filtres
      [edition]/                      Catalogue par maison
      [edition]/[slug]/               Fiche livre (achat, extrait, table…)
    editions/ [slug]/                 Présentation des deux maisons
    boutique/                         Librairie (produits WooCommerce)
    souscription/                     Campagne de dons (paliers)
    rencontres/ · a-propos/ · panier/
```

Les pages qui lisent la base sont en `force-dynamic` (données live, build
indépendant de la base).

## Développement

Les trois bases OVH sont chargées dans une **MariaDB locale** (port 3307). Voir
`.env.example` (copié en `.env.local`).

```bash
# 1. base locale (une fois) — importer les dumps OVH
#    (mariadb-install-db + mariadbd-safe --port=3307, puis importer les .sql.gz)
# 2. dépendances
pnpm install
# 3. lancer
pnpm dev            # http://localhost:3000
pnpm build && pnpm start
```

En production, pointer les variables `CATALOG_*_HOST/USER/PASSWORD` vers les
hôtes OVH (`*.mysql.db`).

## Prochaines étapes

- **Panier & paiement** : rebrancher le panier unifié sur WooCommerce/Stripe
  (déjà configuré côté boutique).
- **Migration des médias** : les couvertures sont encore servies par OVH
  (`next.config.ts` → `images.remotePatterns`) ; à rapatrier.
- **Back-office** : interface simple de mise à jour du catalogue.
- **Souscription** : brancher le paiement des paliers (objectif ~15 août).
- **Contenu éditorial** : pages « à propos » / « rencontres », DA fournie par la
  graphiste interne, sécurisation du HTML (`presentation`).
