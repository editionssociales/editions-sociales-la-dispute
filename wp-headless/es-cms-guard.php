<?php
/**
 * Plugin Name: Éditions sociales · La Dispute — Garde noindex des hosts cms-*
 * Description: Empêche l'indexation des hosts de découplage CMS (`cms-es.…`,
 *              `cms-ld.…`) posés en E3 : ces hosts ne servent que le REST et
 *              les médias au front Next.js, jamais le public. Fichier
 *              **séparé** de `es-headless-rest.php` (contrat : ne pas y
 *              toucher).
 * Version:     1.0.0
 *
 * Compat PHP 5+ volontaire (`strpos($h, 'cms-') === 0`, pas de
 * `str_starts_with` — PHP 8 uniquement) : défense en profondeur, un mu-plugin
 * qui fatale emporte front + REST + wp-admin de l'install, et le PHP d'un
 * dossier peut être changé après nous.
 *
 * Déploiement : déposer dans wp-content/mu-plugins/ des installs
 *   - editionssociales.fr (www)  → cms-es.editionssociales.fr
 *   - ladispute.fr (LaDispute)   → cms-ld.editionssociales.fr
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('send_headers', function () {
    $h = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    if (strpos($h, 'cms-') === 0)
        header('X-Robots-Tag: noindex, nofollow');
});

add_filter('robots_txt', function ($output) {
    $h = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    if (strpos($h, 'cms-') === 0)
        return "User-agent: *\nDisallow: /\n";
    return $output;
}, 99);
