# wp-headless

## Purpose

Mu-plugin (`es-headless-rest.php`) qui réexpose en lecture le CPT `catalogue`
sur l'API REST des deux WordPress sources (`www/`, `LaDispute/`). Fichier
versionné = source de vérité du contrat ; à redéployer manuellement dans
`wp-content/mu-plugins/` de chaque install s'il en disparaît.

## Ownership

- **Owns** : la réexposition REST de `catalogue` (visibilité des taxonomies,
  champ consolidé `book`).
- **Does NOT own** : le front (`src`) ; la boutique (Store API WooCommerce
  native, aucun plugin requis côté WP).

## Local Contracts

- Additif et non destructif : n'altère jamais le rendu WordPress existant.
- Rend visibles en REST les taxonomies `auteur`, `collection`, `parution` —
  seules `auteur` et `collection` sont repliées dans `book` (`collection`
  n'expose que le **premier** terme, même si plusieurs sont assignés).
- Champ `book` par fiche : `isbn`, `prix`, `pages`, `date_parution`,
  `plus_loin`, `table` (URL fichier), `extrait` (URL fichier), `boutique`,
  `parislibrairies`, `lalibrairie`, `authors` (`{name, slug}[]`), `collection`
  (`{name, slug}` ou `null`), `cover` (`{url, width, height}` à la taille
  `large`, ou `null`).
- Repli sans ACF : lecture de la meta brute du même nom si `get_field`
  n'existe pas.
- Le front ne lit du CPT que `id,slug,title,book` (liste) /
  `...,content,book` (fiche) — tout champ dont le front a besoin doit vivre
  dans `book` (cf. `src/lib/catalogue-http.ts`).

## Verification

Après (re)déploiement, vérifier `GET /wp-json/wp/v2/catalogue?_fields=book`
sur les deux installs : la forme doit rester compatible avec
`WpBookField`/`WpCoverField` (`src/lib/catalogue-source.ts`).
