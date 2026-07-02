import type { Book } from "@/lib/types";
import { formatDateFr, formatPrice } from "@/lib/format";

export function BuyLinksList({ book }: { book: Book }) {
  if (book.status === "upcoming") {
    return (
      <p className="text-sm text-muted">
        À paraître{book.publishedAt ? ` le ${formatDateFr(book.publishedAt)}` : ""}.
      </p>
    );
  }
  if (book.status === "unavailable") {
    return (
      <p className="text-sm text-muted">
        Indisponible à la vente en ligne pour le moment.
      </p>
    );
  }

  // Classes hover complètes (littéraux : le JIT ne compile pas les classes
  // construites dynamiquement) — un accent subtil par libraire partenaire.
  const secondary = [
    book.status !== "external" && book.buy.parislibrairies
      ? {
          label: "ParisLibrairies",
          href: book.buy.parislibrairies,
          hoverRing: "hover:ring-navy/40",
        }
      : null,
    book.status !== "external" && book.buy.lalibrairie
      ? {
          label: "LaLibrairie",
          href: book.buy.lalibrairie,
          hoverRing: "hover:ring-bottle/40",
        }
      : null,
  ].filter(
    (o): o is { label: string; href: string; hoverRing: string } => o != null,
  );

  return (
    <div className="flex flex-wrap gap-2">
      {book.permalink && (
        <a
          href={book.permalink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper transition-all hover:-translate-y-0.5 hover:opacity-90 motion-reduce:transition-none"
        >
          {book.status === "available"
            ? `Acheter${book.price != null ? ` · ${formatPrice(book.price)}` : ""}`
            : "Voir en librairie"}
        </a>
      )}
      {secondary.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-paper-2 motion-reduce:transition-none ${s.hoverRing}`}
        >
          {s.label}
        </a>
      ))}
    </div>
  );
}
