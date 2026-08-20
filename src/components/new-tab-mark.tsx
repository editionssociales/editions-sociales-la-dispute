/**
 * Marque « ouvre un nouvel onglet » — à poser en DERNIER enfant du contenu de
 * tout lien `target="_blank"` du front : rien ne distinguait avant le clic un
 * lien qui quitte le site (libraires, PDF, réseaux) d'une navigation interne,
 * et l'utilisateur le découvrait après coup. Primitive partagée SERVEUR (zéro
 * `"use client"`), réutilisable des deux arbres.
 *
 * Deux canaux couplés : le pictogramme ↗ (angles droits R8, même famille que
 * les glyphes du header, décoratif — `aria-hidden`) pour l'œil, et « nouvel
 * onglet » en toutes lettres (`sr-only`, précédé d'une virgule pour se lire à
 * la suite du libellé) pour les technologies d'assistance. `ml-[0.4em]`/`h/w
 * [0.7em]` en em et non en px : la marque suit la taille de texte du lien qui
 * la porte (libellés de 11 à 14px selon les emplacements).
 */
export function NewTabMark() {
  return (
    <>
      <svg
        viewBox="0 0 24 24"
        className="ml-[0.4em] inline-block h-[0.7em] w-[0.7em] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        aria-hidden="true"
      >
        <path d="M6 18 L18 6 M8 6 h10 v10" />
      </svg>
      <span className="sr-only">, nouvel onglet</span>
    </>
  );
}
