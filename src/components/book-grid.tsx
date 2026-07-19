import type { Book } from "@/lib/types";
import { BookCard } from "./book-card";
import { FramedGrid } from "./framed-grid";

export function BookGrid({ books }: { books: Book[] }) {
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 border-2 border-ink bg-paper px-6 py-16 text-center">
        <p className="font-sans text-lg font-black italic text-ink">
          Aucun livre ne correspond à votre recherche.
        </p>
        <p className="text-sm text-ink/60">
          Élargissez vos filtres pour explorer les deux catalogues.
        </p>
      </div>
    );
  }
  return (
    <FramedGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {books.map((book) => (
        <BookCard key={`${book.edition ?? book.origin}-${book.id}`} book={book} />
      ))}
    </FramedGrid>
  );
}
