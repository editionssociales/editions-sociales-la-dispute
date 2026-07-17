<?php
/**
 * Plugin Name: Éditions sociales · La Dispute — Gel de saisie du catalogue
 * Description: Retire les capabilities d'édition du CPT `catalogue` (créer,
 *              modifier, publier, supprimer) une fois le SWAP `pg` effectué
 *              (plan/03-catalogue.md, étape E9) : Payload `/admin` devient
 *              l'unique surface de saisie, wp-admin passe en lecture seule
 *              sur ce CPT. La lecture (front WordPress public, API REST
 *              consommée par le front Next.js et par les scripts de
 *              migration/parité) reste intacte. **Réversible en supprimant
 *              ce fichier** — aucune écriture en base, seulement un
 *              réglage de capabilities réévalué à chaque requête (`init`).
 * Version:     1.0.0
 *
 * Compat PHP 5+ volontaire (mêmes raisons qu'`es-cms-guard.php`) : un
 * mu-plugin qui fatale emporte front + REST + wp-admin de l'install.
 *
 * Choix technique — **surtout ne pas faire `$role->remove_cap(...)`** :
 * le CPT `catalogue` (`functions.php` du thème `cenote_child`, non
 * versionné ici — cf. `LEGACY-STACK.md` §6.1) n'a jamais explicité de
 * `capability_type` propre, donc `edit_posts`/`publish_posts`/`delete_post`…
 * y valent très probablement les MÊMES chaînes que celles des articles et
 * médias WordPress standard. Retirer ces capabilities des rôles casserait
 * l'édition de tout le reste du site (articles, pages, médiathèque) — et
 * `WP_Role::remove_cap()` **écrit en base** (`update_option`), ce qui
 * romprait aussi la promesse « réversible en supprimant le fichier » (la
 * perte de capability survivrait à la suppression du plugin). On préfère
 * donc reformuler intégralement, et EN MÉMOIRE seulement, le tableau
 * `capabilities` du CPT via le filtre `register_post_type_args` (même
 * famille de filtre que `register_taxonomy_args` dans
 * `es-headless-rest.php`) : chaque capability d'écriture pointe vers
 * `do_not_allow` — pseudo-capability WordPress qu'aucun rôle ne détient
 * jamais (même idiome que le CPT natif `revision`) — tandis que les
 * capabilities de lecture gardent leur valeur générique `read` /
 * `read_private_posts`, strictement inchangée. Rien n'est écrit en base :
 * supprimer ce fichier restaure { instantanément et sans purge } le
 * comportement d'avant, dès la requête suivante.
 *
 * Déploiement : déposer dans wp-content/mu-plugins/ des installs
 *   - editionssociales.fr (www)
 *   - ladispute.fr (LaDispute)
 * **avec l'accord du client** (E9, plan/03-catalogue.md) — retrait du
 * fichier = dégel immédiat, sans autre manipulation.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_filter('register_post_type_args', function ($args, $post_type) {
    if ($post_type !== 'catalogue') {
        return $args;
    }

    // Tableau complet et explicite (aucune clé laissée à un défaut calculé
    // depuis `capability_type`) : `get_post_type_capabilities()` ne retombe
    // sur les valeurs partagées avec les articles que pour les clés
    // ABSENTES d'ici — on les fournit donc toutes.
    $args['map_meta_cap'] = true;
    $args['capabilities'] = [
        // Lecture — inchangée (valeurs génériques WordPress, comme avant ce
        // plugin) : front public et REST ne consultent d'ailleurs aucune de
        // ces deux clés pour un article publié (résolu à `read`).
        'read_post'          => 'read',
        'read_private_posts' => 'read_private_posts',
        // Écriture — verrouillée : `do_not_allow` n'est jamais accordée à
        // aucun rôle, y compris administrateur.
        'edit_post'              => 'do_not_allow',
        'edit_posts'             => 'do_not_allow',
        'edit_others_posts'      => 'do_not_allow',
        'edit_private_posts'     => 'do_not_allow',
        'edit_published_posts'   => 'do_not_allow',
        'publish_posts'          => 'do_not_allow',
        'create_posts'           => 'do_not_allow',
        'delete_post'            => 'do_not_allow',
        'delete_posts'           => 'do_not_allow',
        'delete_private_posts'   => 'do_not_allow',
        'delete_published_posts' => 'do_not_allow',
        'delete_others_posts'    => 'do_not_allow',
    ];

    return $args;
}, 10, 2);
