import Link from "next/link";

interface Props {
  page: number;
  totalPages: number;
  /** Construit l'URL d'une page donnée (préserve les autres paramètres actifs). */
  hrefFor: (page: number) => string;
}

export function Pagination({ page, totalPages, hrefFor }: Props) {
  if (totalPages <= 1) return null;

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const items = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1">
      <Link
        href={hrefFor(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`rounded-md px-3 py-2 text-sm font-medium ${
          page <= 1 ? "pointer-events-none text-muted" : "text-ink-soft hover:bg-paper-2"
        }`}
      >
        ← Précédent
      </Link>

      <div className="flex items-center gap-1">
        {items.map((p, i) => (
          <span key={p} className="flex items-center">
            {i > 0 && p - items[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
            <Link
              href={hrefFor(p)}
              aria-current={p === page ? "page" : undefined}
              className={`min-w-9 rounded-md px-2 py-2 text-center text-sm font-medium ${
                p === page ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-2"
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
        className={`rounded-md px-3 py-2 text-sm font-medium ${
          page >= totalPages ? "pointer-events-none text-muted" : "text-ink-soft hover:bg-paper-2"
        }`}
      >
        Suivant →
      </Link>
    </nav>
  );
}
