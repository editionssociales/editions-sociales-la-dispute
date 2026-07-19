import Link from "next/link";
import type { Book } from "@/lib/types";
import { BookCover } from "@/lib/cover";
import { canAddToCart } from "@/lib/cart-core";
import { formatPrice } from "@/lib/format";
import { AddToCartButton } from "./cart/add-to-cart-button";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

export function BookCard({ book }: { book: Book }) {
  // Catalogue : toujours la fiche interne, quel que soit le statut d'achat.
  // Boutique-seul (`edition` absent) : sa propre fiche interne
  // `/boutique/<slug>` existe pour CHAQUE article — achetable ou non, elle
  // informe toujours (plan §4 étape 7).
  const href = book.edition
    ? `/catalogue/${book.edition}/${book.slug}`
    : `/boutique/${book.slug}`;

  const authors =
    book.authors.length > 0 ? book.authors.map((a) => a.name).join(", ") : "";
  const alt = authors ? `${book.title}, ${authors}` : book.title;

  // Largeur fixée par la colonne de la grille ; la hauteur suit le ratio réel
  // de la couverture (jamais recadrée, jamais de bande). Sans couverture, la
  // vignette garde une forme 2/3 par défaut pour le titre de repli.
  const cover = (
    <BookCover
      cover={book.cover}
      title={book.title}
      alt={alt}
      fit="width"
      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
      className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
      fallbackClassName="p-4"
    />
  );

  const upcomingBadge = book.status === "upcoming" && (
    <span className="absolute left-0 top-0 z-[1] border-b-2 border-r-2 border-ink bg-pop-orange px-2 py-0.5 font-sans text-[10px] font-extrabold uppercase tracking-[.05em] text-black">
      À paraître
    </span>
  );
  // Statuts « autre libraire »/« indisponible » : même emplacement que le
  // badge « À paraître » (mutuellement exclusifs, un seul rendu à la fois),
  // sobres plutôt que pop — ce ne sont pas des accents de navigation (R2).
  const externalBadge = book.status === "external" && (
    <span className="absolute left-0 top-0 z-[1] border-b-2 border-r-2 border-ink bg-paper px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[.05em] text-muted">
      Autre libraire
    </span>
  );
  const unavailableBadge = book.status === "unavailable" && (
    <span className="absolute left-0 top-0 z-[1] border-b-2 border-r-2 border-ink bg-paper px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[.05em] text-muted">
      Indisponible
    </span>
  );

  // Panier natif (plan §4 étape 6) : petit chip superposé, en plus du lien
  // vers la fiche — seulement si le livre est disponible au panier.
  const cartChip = canAddToCart(book) && <AddToCartButton id={book.id} variant="chip" />;

  const meta = (
    <div className="mt-3 flex min-w-0 flex-col gap-0.5">
      <p className="font-sans text-sm font-bold leading-snug text-ink line-clamp-2">
        {book.title}
      </p>
      {authors ? (
        <p className="font-sans text-xs leading-snug text-ink-soft line-clamp-1">{authors}</p>
      ) : null}
      {book.price != null && (
        <p className="mt-0.5 font-sans text-sm font-black text-ink">{formatPrice(book.price)}</p>
      )}
    </div>
  );

  return (
    <article className="group flex flex-col bg-paper p-4">
      <Link
        href={href}
        className={`flex flex-col ${FOCUS_RING_LIGHT_OUTER}`}
      >
        <span className="relative block w-full overflow-hidden border-2 border-ink bg-paper-2 transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none">
          {upcomingBadge}
          {externalBadge}
          {unavailableBadge}
          {cover}
          {cartChip}
        </span>
        {meta}
      </Link>
    </article>
  );
}
