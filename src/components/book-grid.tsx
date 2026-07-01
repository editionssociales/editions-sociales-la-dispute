import type { Book } from "@/lib/types";
import { BookCard } from "./book-card";

export function BookGrid({ books }: { books: Book[] }) {
  if (books.length === 0) {
    return (
      <p className="py-16 text-center text-muted">
        Aucun livre ne correspond à votre recherche.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {books.map((book) => (
        <BookCard key={`${book.origin}-${book.slug}`} book={book} />
      ))}
    </div>
  );
}
