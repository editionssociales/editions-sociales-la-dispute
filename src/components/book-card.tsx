import Link from "next/link";
import type { Book } from "@/lib/types";
import { BookCover } from "@/lib/cover";
import { canAddToCart } from "@/lib/cart-core";
import { AddToCartButton } from "./cart/add-to-cart-button";

export function BookCard({ book }: { book: Book }) {
  // Catalogue : toujours la fiche interne, quel que soit le statut d'achat.
  // Boutique-seul (`edition` absent) : sa propre fiche interne
  // `/boutique/<slug>` existe pour CHAQUE article — achetable ou non, elle
  // informe toujours (plan §4 étape 7).
  const href = book.edition
    ? `/catalogue/${book.edition}/${book.slug}`
    : `/boutique/${book.slug}`;

  // Couverture seule : plus de légende texte sous l'image (titre/auteurs déjà
  // imprimés dessus). Le titre + les auteurs vivent dans l'alt — canal légitime
  // pour les crawlers, Google Images et les lecteurs d'écran, qui sert aussi de
  // texte d'ancre du lien interne.
  const alt =
    book.authors.length > 0
      ? `${book.title}, ${book.authors.map((a) => a.name).join(", ")}`
      : book.title;

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
    <span className="absolute left-0 top-0 z-[1] border-b-2 border-r-2 border-black bg-pop-orange px-2 py-0.5 font-sans text-[10px] font-extrabold uppercase tracking-[.05em] text-black">
      À paraître
    </span>
  );

  // Panier natif (plan §4 étape 6) : petit chip superposé, en plus du lien
  // vers la fiche — seulement si le livre est disponible au panier.
  const cartChip = canAddToCart(book) && <AddToCartButton id={book.id} variant="chip" />;

  return (
    <article className="group flex flex-col bg-white p-4">
      {href ? (
        <Link
          href={href}
          className="relative block w-full overflow-hidden border-2 border-black bg-paper-2 transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-pop-yellow focus-visible:outline-offset-2"
        >
          {upcomingBadge}
          {cover}
          {cartChip}
        </Link>
      ) : (
        <div className="relative w-full overflow-hidden border-2 border-black bg-paper-2">
          {upcomingBadge}
          {cover}
          {cartChip}
        </div>
      )}
    </article>
  );
}
