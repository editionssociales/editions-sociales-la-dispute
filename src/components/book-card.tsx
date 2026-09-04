import Link from "next/link";
import type { Book } from "@/lib/types";
import { BookCover } from "@/lib/cover";
import { canAddToCart } from "@/lib/cart-core";
import { AddToCartButton } from "./cart/add-to-cart-button";
import { BookPrice } from "./book-price";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

export function BookCard({ book, preload }: { book: Book; preload?: boolean }) {
  // Catalogue : toujours la fiche interne, quel que soit le statut d'achat.
  // Boutique-seul (`edition` absent) : sa propre fiche interne
  // `/boutique/<slug>` existe pour CHAQUE article — achetable ou non, elle
  // informe toujours (plan §4 étape 7).
  const href = book.edition
    ? `/catalogue/${book.edition}/${book.slug}`
    : `/boutique/${book.slug}`;

  const authors =
    book.authors.length > 0 ? book.authors.map((a) => a.name).join(", ") : "";
  const alt = authors ? `${book.title}, ${authors}` : book.title;

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
      preload={preload}
    />
  );

  // Badges de statut — sortis du cadre couverture (rangée basse fixe), même
  // recette que la légende du carrousel (`border-b-2 border-r-2`, un liseré
  // décalé plutôt qu'un ancrage absolu). Mutuellement exclusifs, un seul
  // rendu à la fois ; « autre libraire »/« indisponible » restent sobres
  // plutôt que pop — ce ne sont pas des accents de navigation (R2).
  const upcomingBadge = book.status === "upcoming" && (
    <span className="inline-flex flex-none border-b-2 border-r-2 border-ink bg-pop-orange px-2 py-0.5 font-sans text-[10px] font-extrabold uppercase tracking-[.05em] text-black">
      À paraître
    </span>
  );
  // Précommande (client 2026-08-20) : même recette que le badge « À paraître »
  // (même famille visuelle — à paraître avec une porte ouverte) — un livre
  // `preorder` a AUSSI le chip panier (`canAddToCart` l'accepte désormais),
  // le badge annonce donc juste que c'est une précommande, pas un blocage.
  const preorderBadge = book.status === "preorder" && (
    <span className="inline-flex flex-none border-b-2 border-r-2 border-ink bg-pop-orange px-2 py-0.5 font-sans text-[10px] font-extrabold uppercase tracking-[.05em] text-black">
      Précommande
    </span>
  );
  const externalBadge = book.status === "external" && (
    <span className="inline-flex flex-none border-b-2 border-r-2 border-ink bg-paper px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[.05em] text-muted">
      Autre libraire
    </span>
  );
  // « Épuisé » (stock à 0) distingué du reste (demande client 2026-09-04) —
  // même recette visuelle que « Indisponible », seul le libellé change.
  const unavailableBadge = book.status === "unavailable" && (
    <span className="inline-flex flex-none border-b-2 border-r-2 border-ink bg-paper px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[.05em] text-muted">
      {book.unavailableReason === "out-of-stock" ? "Épuisé" : "Indisponible"}
    </span>
  );
  const statusBadge = preorderBadge || upcomingBadge || externalBadge || unavailableBadge;

  // Panier natif (plan §4 étape 6) : petit chip, en plus du lien vers la
  // fiche — seulement si le livre est disponible au panier. Sorti du cadre
  // couverture (rangée basse fixe), à droite du badge de statut.
  const cartChip = canAddToCart(book) && <AddToCartButton id={book.id} variant="chip" />;

  // Épure minimaliste : la couverture porte déjà titre/auteurs (alt complet
  // ci-dessus) — la carte n'affiche que le prix en texte visible, quel que
  // soit le statut d'achat (`BookPrice` : le prix est un fait du livre).
  const priceBlock = (
    <BookPrice
      price={book.price}
      className="min-w-0 truncate font-sans text-sm font-black text-ink"
    />
  );

  const hasFooter = Boolean(book.price != null || statusBadge || cartChip);

  return (
    // Carte pleine hauteur : le grid parent (`FramedGrid`, `book-grid.tsx`)
    // étire déjà chaque cellule à la hauteur de sa rangée (stretch, défaut
    // CSS Grid) — `h-full` + `flex-1` sur le lien propagent cette hauteur ;
    // la rangée basse (prix/badge/puce) est un FRÈRE du lien, jamais un
    // descendant : la puce panier est un vrai `<button>`
    // (`cart/add-to-cart-button.tsx`), et un `<a>` exclut tout descendant
    // interactif (HTML Living Standard, règle `nested-interactive` d'axe-core
    // — jamais un élément à la fois lien et bouton).
    // Le lien continue de couvrir la couverture (titre porté par son `alt`) ;
    // le frère qui suit, poussé en bas par la croissance du lien, garde le
    // rendu visuel inchangé.
    <article className="group flex h-full flex-col bg-paper p-4">
      <Link href={href} className={`flex h-full flex-1 flex-col ${FOCUS_RING_LIGHT_OUTER}`}>
        <span className="relative block w-full overflow-hidden border-2 border-ink bg-paper-2 transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none">
          {cover}
        </span>
      </Link>
      {hasFooter && (
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">{priceBlock}</div>
          <div className="flex flex-none items-center gap-2">
            {statusBadge}
            {cartChip}
          </div>
        </div>
      )}
    </article>
  );
}
