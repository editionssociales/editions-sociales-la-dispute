import Link from "next/link";
import { Fragment } from "react";

/**
 * Fil d'ariane — recette partagée par toutes les pages qui en affichent un :
 * texte discret, liens qui s'assombrissent au survol, séparateur `/`
 * décoratif. Porte sa propre marge basse (`mb-6`) — l'appelant n'ajoute plus
 * de `mt-*` sur le bloc qui suit. `tone="light"` (défaut, `text-muted`) pour
 * les pages à fond clair ; `tone="dark"` (`text-paper/70`) pour les héros
 * plein cadre à fond sombre (`/editions/[slug]`). Par défaut, la dernière
 * miette est du texte (page courante) ; `currentIsPage={false}` la rend
 * cliquable quand le fil ne va pas jusqu'à la page elle-même (fiches produit :
 * le fil s'arrête à la collection, le titre du livre fait office de page
 * courante via le `<h1>`).
 */

export type Crumb = { label: string; href?: string };

const TONE = {
  light: { base: "text-muted", hover: "hover:text-ink", current: "text-ink" },
  dark: { base: "text-paper/70", hover: "hover:text-paper", current: "text-paper" },
} as const;

export function Breadcrumb({
  trail,
  tone = "light",
  currentIsPage = true,
  className,
}: {
  trail: Crumb[];
  /** Fond de la page portant le fil — pilote la couleur du texte (R5/R6). */
  tone?: "light" | "dark";
  /** `false` : le dernier maillon reste cliquable (la page elle-même n'est pas dans le fil). */
  currentIsPage?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  const base = `mb-6 font-sans text-xs font-bold uppercase tracking-[.06em] ${t.base}`;

  return (
    <nav aria-label="Fil d'ariane" className={className ? `${base} ${className}` : base}>
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1;
        const isLink = crumb.href && (!isLast || !currentIsPage);

        return (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && (
              <span aria-hidden="true" className="px-1.5">
                /
              </span>
            )}
            {isLink ? (
              <Link
                href={crumb.href!}
                className={`transition-colors motion-reduce:transition-none ${t.hover}`}
              >
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast && currentIsPage ? t.current : undefined}>
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
