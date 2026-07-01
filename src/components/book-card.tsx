import Image from "next/image";
import Link from "next/link";
import type { Book } from "@/lib/types";
import { formatPrice, yearOf } from "@/lib/format";
import { EditionBadge } from "./edition-badge";

export function BookCard({ book }: { book: Book }) {
  const href = `/catalogue/${book.edition}/${book.slug}`;
  const year = yearOf(book.publishedAt);
  return (
    <article className="group flex flex-col">
      <Link
        href={href}
        className="relative block aspect-[2/3] overflow-hidden rounded-sm bg-paper-2 ring-1 ring-line"
      >
        {book.coverUrl ? (
          <Image
            src={book.coverUrl}
            alt={`Couverture de « ${book.title} »`}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex h-full items-center justify-center p-4 text-center font-serif text-sm text-muted">
            {book.title}
          </span>
        )}
      </Link>

      <div className="mt-3 flex flex-1 flex-col">
        <EditionBadge edition={book.edition} className="mb-1.5 self-start" />
        <h3 className="font-serif text-[15px] font-semibold leading-snug">
          <Link href={href} className="hover:text-es">
            {book.title}
          </Link>
        </h3>
        {book.authors.length > 0 && (
          <p className="mt-0.5 text-sm text-ink-soft">
            {book.authors.map((a) => a.name).join(", ")}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted">
          {book.collection && <span>{book.collection.name}</span>}
          {book.collection && year && <span aria-hidden>·</span>}
          {year && <span>{year}</span>}
          {book.price != null && (
            <span className="ml-auto font-medium text-ink">
              {formatPrice(book.price)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
