import Link from "next/link";

interface Props {
  page: number;
  totalPages: number;
  /** Construit l'URL d'une page donnée (préserve les autres paramètres actifs). */
  hrefFor: (page: number) => string;
}

/** Flèches Précédent/Suivant — classes littérales complètes (contrainte JIT). */
function arrowClass(disabled: boolean): string {
  return `rounded-full px-4 py-2 text-sm font-medium transition-all motion-reduce:transition-none ${
    disabled
      ? "pointer-events-none text-muted ring-1 ring-inset ring-line/60"
      : "text-ink-soft ring-1 ring-inset ring-line hover:-translate-y-0.5 hover:bg-paper-2"
  }`;
}

export function Pagination({ page, totalPages, hrefFor }: Props) {
  if (totalPages <= 1) return null;

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const items = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  return (
    <nav
      aria-label="Pagination"
      className="mt-12 flex flex-wrap items-center justify-center gap-2"
    >
      <Link
        href={hrefFor(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={arrowClass(page <= 1)}
      >
        ← Précédent
      </Link>

      <div className="flex items-center gap-1">
        {items.map((p, i) => (
          <span key={p} className="flex items-center">
            {i > 0 && p - items[i - 1] > 1 && (
              <span className="px-1 text-muted" aria-hidden="true">
                …
              </span>
            )}
            <Link
              href={hrefFor(p)}
              aria-current={p === page ? "page" : undefined}
              className={`min-w-9 rounded-full px-2.5 py-2 text-center text-sm transition-all motion-reduce:transition-none ${
                p === page
                  ? "bg-ink font-semibold text-paper"
                  : "font-medium text-ink-soft hover:bg-paper-2 hover:ring-1 hover:ring-inset hover:ring-line"
              }`}
            >
              {p}
            </Link>
          </span>
        ))}
      </div>

      <Link
        href={hrefFor(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={arrowClass(page >= totalPages)}
      >
        Suivant →
      </Link>
    </nav>
  );
}
