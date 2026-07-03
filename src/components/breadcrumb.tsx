import Link from "next/link";
import { Fragment } from "react";

/**
 * Fil d'ariane — recette partagée par les 8 pages qui en affichent un :
 * texte gris `text-black/60`, liens qui s'assombrissent au survol, dernière
 * miette (page courante) en noir plein, séparateur `/` décoratif.
 */

export type Crumb = { label: string; href?: string };

export function Breadcrumb({
  trail,
  className,
}: {
  trail: Crumb[];
  className?: string;
}) {
  const base = "font-sans text-xs font-bold uppercase tracking-[.06em] text-black/60";

  return (
    <nav aria-label="Fil d'ariane" className={className ? `${base} ${className}` : base}>
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1;

        return (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && (
              <span aria-hidden="true" className="px-1.5">
                /
              </span>
            )}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="transition-colors motion-reduce:transition-none hover:text-black"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="text-black">{crumb.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
