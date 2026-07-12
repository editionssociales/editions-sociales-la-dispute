import type { Book } from "@/lib/types";
import { formatDateFr, formatPrice } from "@/lib/format";
import { Button } from "./button";

export function BuyLinksList({ book }: { book: Book }) {
  if (book.status === "upcoming") {
    return (
      <p className="text-sm text-black/60">
        À paraître{book.publishedAt ? ` le ${formatDateFr(book.publishedAt)}` : ""}.
      </p>
    );
  }
  if (book.status === "unavailable") {
    return (
      <p className="text-sm text-black/60">
        Indisponible à la vente en ligne pour le moment.
      </p>
    );
  }

  const secondary = [
    book.status !== "external" && book.buy.parislibrairies
      ? { label: "ParisLibrairies", href: book.buy.parislibrairies }
      : null,
    book.status !== "external" && book.buy.lalibrairie
      ? { label: "LaLibrairie", href: book.buy.lalibrairie }
      : null,
  ].filter((o): o is { label: string; href: string } => o != null);

  return (
    <div className="flex flex-wrap gap-2">
      {book.permalink && (
        <Button
          href={book.permalink}
          target="_blank"
          rel="noreferrer"
          className="px-5 py-2.5 text-sm tracking-[.03em]"
        >
          {book.status === "available"
            ? `Acheter${book.price != null ? ` · ${formatPrice(book.price)}` : ""}`
            : "Voir en librairie"}
        </Button>
      )}
      {secondary.map((s) => (
        <Button
          key={s.label}
          href={s.href}
          variant="outline"
          target="_blank"
          rel="noreferrer"
          className="px-5 py-2.5 text-sm tracking-[.03em]"
        >
          {s.label}
        </Button>
      ))}
    </div>
  );
}
