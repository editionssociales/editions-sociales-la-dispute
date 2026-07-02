import Link from "next/link";
import type { Book } from "@/lib/types";
import { Cover } from "@/lib/cover";
import { formatPrice, purchaseLabel, yearOf } from "@/lib/format";
import { CollectionTag } from "./collection-tag";

export function BookCard({ book }: { book: Book }) {
  const href = book.edition ? `/catalogue/${book.edition}/${book.slug}` : book.permalink;
  const external = !book.edition;
  const year = yearOf(book.publishedAt);
  const linkProps = external ? { target: "_blank" as const, rel: "noreferrer" } : {};

  // Largeur fixée par la colonne de la grille ; la hauteur suit le ratio réel
  // de la couverture (jamais recadrée, jamais de bande). Sans couverture, la
  // vignette garde une forme 2/3 par défaut pour le titre de repli.
  const cover = book.cover ? (
    <Cover
      cover={book.cover}
      alt={`Couverture de « ${book.title} »`}
      fit="width"
      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
      className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
    />
  ) : (
    <span className="flex aspect-[2/3] items-center justify-center p-4 text-center font-serif text-sm text-muted">
      {book.title}
    </span>
  );

  return (
    <article className="group flex flex-col">
      {href ? (
        <Link
          href={href}
          {...linkProps}
          className="relative block w-full overflow-hidden rounded-sm bg-paper-2 shadow-ink/10 ring-1 ring-line transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lg motion-reduce:transition-none"
        >
          {cover}
          {book.status === "upcoming" && (
            <span className="absolute left-2 top-2 rounded-full bg-ocher px-2 py-0.5 text-[11px] font-semibold text-ink">
              À paraître
            </span>
          )}
        </Link>
      ) : (
        <div className="relative w-full overflow-hidden rounded-sm bg-paper-2 ring-1 ring-line">
          {cover}
        </div>
      )}

      <div className="mt-3 flex flex-1 flex-col">
        {book.collection && <CollectionTag collection={book.collection} className="mb-1.5 self-start" />}
        <h3 className="font-serif text-[15px] font-semibold leading-snug">
          {href ? (
            <Link href={href} {...linkProps} className="hover:underline">
              {book.title}
            </Link>
          ) : (
            book.title
          )}
        </h3>
        {book.authors.length > 0 && (
          <p className="mt-0.5 text-sm text-ink-soft">
            {book.authors.map((a) => a.name).join(", ")}
          </p>
        )}
        <div className="mt-auto flex items-baseline gap-2 pt-2 text-xs">
          {year && <span className="text-muted">{year}</span>}
          {book.status === "available" || book.status === "external" ? (
            <span className="ml-auto font-semibold text-ink">
              {formatPrice(book.price)}
            </span>
          ) : (
            <span className="ml-auto font-medium text-ink-soft">
              {purchaseLabel(book.status)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
