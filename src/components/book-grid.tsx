import type { Book } from "@/lib/types";
import { BookCard } from "./book-card";

export function BookGrid({ books }: { books: Book[] }) {
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 border-2 border-black bg-white px-6 py-16 text-center">
        <p className="font-sans text-lg font-black italic text-black">
          Aucun livre ne correspond à votre recherche.
        </p>
        <p className="text-sm text-black/60">
          Élargissez vos filtres pour explorer les deux catalogues.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-[2px] bg-black p-[2px] sm:grid-cols-3 lg:grid-cols-4">
      {books.map((book) => (
        <BookCard key={`${book.edition ?? book.origin}-${book.id}`} book={book} />
      ))}
    </div>
  );
}
