import type { Term } from "@/lib/types";

/**
 * Étiquette de libellé — grille brutaliste : cellule plate encadrée de
 * noir, texte noir en gras majuscule (aucun arrondi, aucune couleur pop
 * réservée aux 4 sections de la navbar).
 */
export function LibelleTag({
  libelle,
  className = "",
}: {
  libelle: Term;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center border border-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.06em] text-ink ${className}`}
    >
      {libelle.name}
    </span>
  );
}
