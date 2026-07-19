import type { Book } from "@/lib/types";
import { canAddToCart } from "@/lib/cart-core";
import { formatDateFr, formatPrice } from "@/lib/format";
import { AddToCartButton } from "./cart/add-to-cart-button";
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

  // Panier natif (plan §4 étape 6, reflet exact de `resolveNativePurchase`) :
  // bouton panier pour un livre disponible. `book.permalink` vaut alors la
  // fiche interne elle-même (pas un lien d'achat externe) — inutile ici,
  // remplacé par le bouton.
  if (canAddToCart(book)) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <AddToCartButton id={book.id} />
        {book.price != null && (
          <span className="font-sans text-sm font-bold text-black">{formatPrice(book.price)}</span>
        )}
      </div>
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
            : `Voir en librairie${book.price != null ? ` · ${formatPrice(book.price)}` : ""}`}
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
