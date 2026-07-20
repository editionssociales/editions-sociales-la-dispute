import Link from "next/link";
import type { Term } from "@/lib/types";
import { FOCUS_RING_LIGHT } from "@/lib/ui";

/**
 * Étiquette de libellé — grille brutaliste : cellule plate encadrée de
 * noir, texte noir en gras majuscule (aucun arrondi, aucune couleur pop
 * réservée aux 4 sections de la navbar). Avec `href`, double comme seul
 * point d'entrée vers le catalogue filtré sur ce libellé (fiche livre :
 * plus d'entrée « Libellé » redondante dans la grille de la colonne
 * d'achat, ces chips en tiennent lieu).
 */
export function LibelleTag({
  libelle,
  href,
  className = "",
}: {
  libelle: Term;
  href?: string;
  className?: string;
}) {
  const base = `inline-flex items-center border border-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.06em] text-ink ${className}`;
  if (href) {
    return (
      <Link
        href={href}
        className={`transition-colors hover:bg-ink hover:text-paper motion-reduce:transition-none ${base} ${FOCUS_RING_LIGHT}`}
      >
        {libelle.name}
      </Link>
    );
  }
  return <span className={base}>{libelle.name}</span>;
}
