# wp-headless

## Purpose

Mu-plugins du découplage WordPress–Payload pour le CPT catalogue, versionnés ici, à redéployer manuellement en `wp-content/mu-plugins/` des deux installs WordPress si absent.

## Ownership

- **Owns** : réexposition REST du catalogue avec taxonomies ; noindex des hosts de découplage ; gel des capacités d'écriture catalogue post-SWAP.
- **Does NOT own** : le front (`src`) ; la boutique (Store API WooCommerce).

## Local Contracts

- Non destructif : n'altère jamais le rendu WordPress.
- Expose en REST les taxonomies `auteur`, `collection`, `parution` ; consolide la métadonnée catalogue en champ `book` (schéma in code, cf. `es-headless-rest.php`).
- `es-freeze-catalogue.php` gèle l'écriture (capabilities) post-SWAP `CATALOGUE_SOURCE=pg` — ne déposer qu'avec accord du client, après SWAP ; retrait = dégel sans perte de données.

## Verification

`GET /wp-json/wp/v2/catalogue?_fields=book` doit rester compatible post-déploiement. Après `es-freeze-catalogue.php` : plus aucune capacité d'écriture catalogue (menu wp-admin disparaît). Lecture publique et REST inchangées.
