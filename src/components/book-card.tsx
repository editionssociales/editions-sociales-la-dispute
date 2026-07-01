import Image from "next/image";
import Link from "next/link";
import type { Book } from "@/lib/types";
import { formatPrice, purchaseLabel, yearOf } from "@/lib/format";
import { CollectionTag } from "./collection-tag";

export function BookCard({ book }: { book: Book }) {
  const href = book.edition
    ? `/catalogue/${book.edition}/${book.slug}`
    : book.permalink ?? "#";
  const external = !book.edition;
  const year = yearOf(book.publishedAt);

  return (
    <article className="group flex flex-col">
      <Link
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="relative block w-full overflow-hidden rounded-sm bg-paper-2 ring-1 ring-line"
        style={{ aspectRatio: book.cover ? `${book.cover.width} / ${book.cover.height}` : "2 / 3" }}
      >
        {book.cover ? (
          <Image
            src={book.cover.url}
            alt={`Couverture de « ${book.title} »`}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
            className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="flex h-full items-center justify-center p-4 text-center font-serif text-sm text-muted">
            {book.title}
          </span>
        )}
        {book.status === "upcoming" && (
          <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-paper">
            À paraître
          </span>
        )}
      </Link>

      <div className="mt-3 flex flex-1 flex-col">
        {book.collection && <CollectionTag collection={book.collection} className="mb-1.5 self-start" />}
        <h3 className="font-serif text-[15px] font-semibold leading-snug">
          <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="hover:underline">
            {book.title}
          </Link>
        </h3>
        {book.authors.length > 0 && (
          <p className="mt-0.5 text-sm text-ink-soft">
            {book.authors.map((a) => a.name).join(", ")}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted">
          {year && <span>{year}</span>}
          <span className="ml-auto font-medium text-ink">
            {book.status === "available" || book.status === "external"
              ? formatPrice(book.price)
              : purchaseLabel(book.status)}
          </span>
        </div>
      </div>
    </article>
  );
}
