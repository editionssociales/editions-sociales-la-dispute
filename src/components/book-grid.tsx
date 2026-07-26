import type { Book } from "@/lib/types";
import { BookCard } from "./book-card";
import { Button } from "./button";
import { FramedGrid } from "./framed-grid";

/**
 * Nombre de couvertures préchargées (`preload`, `src/lib/cover.tsx`) — rien
 * au-dessus des grilles /catalogue et /catalogue/[edition] ne porte d'image :
 * la première rangée de couvertures EST le candidat LCP. Le rendu serveur ne
 * connaît pas la largeur du viewport (2/3/4 colonnes selon le breakpoint,
 * `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` ci-dessous) — 4 couvre la
 * vraie première rangée à CHAQUE breakpoint plutôt que de deviner laquelle.
 */
const PRELOAD_COUNT = 4;

export function BookGrid({
  books,
  resetHref = "/catalogue",
  emptyTitle = "Aucun livre ne correspond à votre recherche.",
  emptyHint = "Élargissez vos filtres ou repartez du catalogue complet.",
}: {
  books: Book[];
  /** Sortie proposée en état « 0 résultat » — le catalogue complet par défaut. */
  resetHref?: string;
  /** État vide contextualisé (la boutique sans article n'est pas une recherche sans résultat). */
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 border-2 border-ink bg-paper px-6 py-16 text-center">
        <p className="font-sans text-lg font-black italic text-ink">{emptyTitle}</p>
        <p className="max-w-sm text-sm text-muted">{emptyHint}</p>
        <Button href={resetHref} className="px-5 py-2.5 text-sm tracking-[.03em]">
          Voir tout le catalogue
        </Button>
      </div>
    );
  }
  return (
    <FramedGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {books.map((book, i) => (
        <BookCard
          key={`${book.edition ?? book.origin}-${book.id}`}
          book={book}
          preload={i < PRELOAD_COUNT}
        />
      ))}
    </FramedGrid>
  );
}
