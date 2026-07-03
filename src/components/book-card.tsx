import Link from "next/link";
import type { Book } from "@/lib/types";
import { BookCover } from "@/lib/cover";
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
  const cover = (
    <BookCover
      cover={book.cover}
      title={book.title}
      alt={`Couverture de « ${book.title} »`}
      fit="width"
      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
      className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
      fallbackClassName="p-4"
    />
  );

  return (
    <article className="group flex flex-col bg-white p-4">
      {href ? (
        <Link
          href={href}
          {...linkProps}
          className="relative block w-full overflow-hidden border-2 border-black bg-paper-2 transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-pop-yellow focus-visible:outline-offset-2"
        >
          {cover}
        </Link>
      ) : (
        <div className="relative w-full overflow-hidden border-2 border-black bg-paper-2">{cover}</div>
      )}

      <div className="mt-3 flex flex-1 flex-col">
        {book.collection && <CollectionTag collection={book.collection} className="mb-1.5 self-start" />}
        <h3 className="font-serif text-[15px] font-semibold leading-snug text-black">
          {href ? (
            <Link href={href} {...linkProps} className="hover:underline">
              {book.title}
            </Link>
          ) : (
            book.title
          )}
        </h3>
        {book.authors.length > 0 && (
          <p className="mt-0.5 text-sm text-black/70">
            {book.authors.map((a) => a.name).join(", ")}
          </p>
        )}
        <div className="mt-auto flex items-baseline gap-2 pt-2 font-sans text-xs font-bold uppercase tracking-[.03em]">
          {year && <span className="text-black/50">{year}</span>}
          {book.status === "available" || book.status === "external" ? (
            <span className="ml-auto text-black">{formatPrice(book.price)}</span>
          ) : book.status === "upcoming" ? (
            // Même badge que jadis en haut de la couverture, mais posé à
            // l'emplacement du prix (plus de doublon avec l'étiquette collante).
            <span className="ml-auto border border-black bg-pop-orange px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[.05em] text-black">
              À paraître
            </span>
          ) : (
            <span className="ml-auto text-black/70">{purchaseLabel(book.status)}</span>
          )}
        </div>
      </div>
    </article>
  );
}
