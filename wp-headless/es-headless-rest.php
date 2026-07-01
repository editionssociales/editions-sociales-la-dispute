<?php
/**
 * Plugin Name: Éditions sociales · La Dispute — Exposition REST (headless)
 * Description: Expose le CPT « catalogue » (taxonomies + champs ACF) dans l'API
 *              REST pour le site Next.js unifié. Additif et non destructif :
 *              n'altère en rien le fonctionnement du site WordPress existant.
 * Version:     1.0.0
 *
 * Déploiement : déposer ce fichier dans wp-content/mu-plugins/ des sites
 *   - editionssociales.fr (www)
 *   - ladispute.fr        (LaDispute)
 * (mu-plugins = « must-use », activés automatiquement, sans écran d'admin.)
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * 1) Rendre les taxonomies du catalogue visibles dans l'API REST.
 *    (Elles sont enregistrées sans show_in_rest dans le thème.)
 */
add_filter('register_taxonomy_args', function ($args, $taxonomy) {
    if (in_array($taxonomy, ['auteur', 'collection', 'parution'], true)) {
        $args['show_in_rest'] = true;
        $args['rest_base']    = $taxonomy;
    }
    return $args;
}, 10, 2);

/**
 * 2) Exposer les champs ACF + les termes sous une clé `book` consolidée,
 *    directement consommable par le front (aucune logique WP côté Next.js).
 */
add_action('rest_api_init', function () {
    register_rest_field('catalogue', 'book', [
        'get_callback' => 'es_headless_book_payload',
        'schema'       => null,
    ]);
});

function es_headless_get_field($name, $id)
{
    if (function_exists('get_field')) {
        $v = get_field($name, $id);
        return ($v === '' || $v === false) ? null : $v;
    }
    // Repli si ACF absent : lire la meta brute.
    $v = get_post_meta($id, $name, true);
    return $v === '' ? null : $v;
}

/** Résout un champ fichier ACF (id d'attachement, tableau ou URL) en URL. */
function es_headless_file_url($value)
{
    if (empty($value)) {
        return null;
    }
    if (is_array($value)) {
        return $value['url'] ?? null;
    }
    if (is_numeric($value)) {
        $url = wp_get_attachment_url((int) $value);
        return $url ?: null;
    }
    return $value;
}

function es_headless_terms($id, $taxonomy)
{
    $terms = wp_get_post_terms($id, $taxonomy);
    if (is_wp_error($terms) || empty($terms)) {
        return [];
    }
    return array_map(function ($t) {
        return ['name' => $t->name, 'slug' => $t->slug];
    }, $terms);
}

/**
 * Dimensions réelles de la couverture (taille 'large', non recadrée) : le
 * front en a besoin pour afficher chaque couverture à son ratio exact, sans
 * recadrage.
 */
function es_headless_cover($cover_id)
{
    if (!$cover_id) {
        return null;
    }
    $img = wp_get_attachment_image_src($cover_id, 'large');
    if (!$img) {
        return null;
    }
    return [
        'url'    => $img[0],
        'width'  => $img[1],
        'height' => $img[2],
    ];
}

function es_headless_book_payload($post)
{
    $id = $post['id'];

    $authors    = es_headless_terms($id, 'auteur');
    $collections = es_headless_terms($id, 'collection');
    $cover_id   = get_post_thumbnail_id($id);

    return [
        'isbn'            => es_headless_get_field('isbn', $id),
        'prix'            => es_headless_get_field('prix', $id),
        'pages'           => es_headless_get_field('nombre_pages', $id),
        'date_parution'   => es_headless_get_field('date_parution', $id),
        'plus_loin'       => es_headless_get_field('plus_loin', $id),
        'table'           => es_headless_file_url(es_headless_get_field('table', $id)),
        'extrait'         => es_headless_file_url(es_headless_get_field('extrait_choisi', $id)),
        'boutique'        => es_headless_get_field('boutique_es', $id),
        'parislibrairies' => es_headless_get_field('parislibrairies', $id),
        'lalibrairie'     => es_headless_get_field('lalibrairie', $id),
        'authors'         => $authors,
        'collection'      => $collections[0] ?? null,
        'cover'           => es_headless_cover($cover_id),
    ];
}
