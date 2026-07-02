import type { Book } from "@/lib/types";
import { ACCENTS, ACCENT_BG } from "@/lib/accents";
import { BookCard } from "./book-card";

export function BookGrid({ books }: { books: Book[] }) {
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 py-16 text-center">
        <div className="flex items-center gap-2.5" aria-hidden="true">
          {ACCENTS.map((a) => (
            <span key={a} className={`h-2 w-2 rotate-45 ${ACCENT_BG[a]}`} />
          ))}
        </div>
        <div>
          <p className="font-serif text-lg font-semibold text-ink">
            Aucun livre ne correspond à votre recherche.
          </p>
          <p className="mt-1 text-sm text-muted">
            Élargissez vos filtres pour explorer les deux catalogues.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {books.map((book) => (
        <BookCard key={`${book.edition ?? book.origin}-${book.id}`} book={book} />
      ))}
    </div>
  );
}
