import Link from "next/link";
import { FramedGrid } from "@/components/framed-grid";
import { FOCUS_RING, invertingCell } from "@/lib/ui";

interface Props {
  page: number;
  totalPages: number;
  /** Construit l'URL d'une page donnée (préserve les autres paramètres actifs). */
  hrefFor: (page: number) => string;
}

/** Flèches Précédent/Suivant — cellules carrées 40px de haut, grille encadrée. */
function arrowClass(disabled: boolean): string {
  return `flex h-10 items-center gap-1.5 bg-white px-4 text-sm font-bold uppercase tracking-[.03em] text-black transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
    disabled ? "pointer-events-none text-black/30" : "hover:bg-black hover:text-white"
  }`;
}

export function Pagination({ page, totalPages, hrefFor }: Props) {
  if (totalPages <= 1) return null;

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const items = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  return (
    <FramedGrid
      as="nav"
      flow="flex"
      aria-label="Pagination"
      className="mt-12 items-stretch"
    >
      {page <= 1 ? (
        <span className={arrowClass(true)}>← Précédent</span>
      ) : (
        <Link href={hrefFor(page - 1)} className={arrowClass(false)}>
          ← Précédent
        </Link>
      )}

      <div className="flex flex-wrap items-stretch gap-[2px]">
        {items.map((p, i) => (
          <span key={p} className="flex items-stretch">
            {i > 0 && p - items[i - 1] > 1 && (
              <span
                className="flex h-10 w-6 items-center justify-center bg-white text-black/40"
                aria-hidden="true"
              >
                …
              </span>
            )}
            <Link
              href={hrefFor(p)}
              aria-current={p === page ? "page" : undefined}
              className={`flex h-10 w-10 items-center justify-center text-sm font-bold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${invertingCell(p === page)}`}
            >
              {p}
            </Link>
          </span>
        ))}
      </div>

      {page >= totalPages ? (
        <span className={arrowClass(true)}>Suivant →</span>
      ) : (
        <Link href={hrefFor(page + 1)} className={arrowClass(false)}>
          Suivant →
        </Link>
      )}
    </FramedGrid>
  );
}
