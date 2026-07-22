import Link from "next/link";
import type { Book } from "@/lib/types";
import { BookCover } from "@/lib/cover";
import { canAddToCart } from "@/lib/cart-core";
import { formatPrice } from "@/lib/format";
import { AddToCartButton } from "./cart/add-to-cart-button";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

export function BookCard({ book }: { book: Book }) {
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
  const externalBadge = book.status === "external" && (
    <span className="inline-flex flex-none border-b-2 border-r-2 border-ink bg-paper px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[.05em] text-muted">
      Autre libraire
    </span>
  );
  const unavailableBadge = book.status === "unavailable" && (
    <span className="inline-flex flex-none border-b-2 border-r-2 border-ink bg-paper px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[.05em] text-muted">
      Indisponible
    </span>
  );
  const statusBadge = upcomingBadge || externalBadge || unavailableBadge;

  // Panier natif (plan §4 étape 6) : petit chip, en plus du lien vers la
  // fiche — seulement si le livre est disponible au panier. Sorti du cadre
  // couverture (rangée basse fixe), à droite du badge de statut.
  const cartChip = canAddToCart(book) && <AddToCartButton id={book.id} variant="chip" />;

  // Épure minimaliste : la couverture porte déjà titre/auteurs (alt complet
  // ci-dessus) — la carte n'affiche que le prix en texte visible.
  const priceBlock = book.price != null && (
    <p className="min-w-0 truncate font-sans text-sm font-black text-ink">
      {formatPrice(book.price)}
    </p>
  );

  const hasFooter = Boolean(priceBlock || statusBadge || cartChip);

  return (
    // Carte pleine hauteur : le grid parent (`FramedGrid`, `book-grid.tsx`)
    // étire déjà chaque cellule à la hauteur de sa rangée (stretch, défaut
    // CSS Grid) — `h-full` + `flex-1` sur le lien propagent cette hauteur
    // jusqu'à la rangée basse, pour qu'elle reste calée sur le bas du cadre
    // (`mt-auto`) même quand les cartes voisines ont une couverture plus haute.
    <article className="group flex h-full flex-col bg-paper p-4">
      <Link href={href} className={`flex h-full flex-1 flex-col ${FOCUS_RING_LIGHT_OUTER}`}>
        <span className="relative block w-full overflow-hidden border-2 border-ink bg-paper-2 transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none">
          {cover}
        </span>
        {hasFooter && (
          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <div className="min-w-0">{priceBlock}</div>
            <div className="flex flex-none items-center gap-2">
              {statusBadge}
              {cartChip}
            </div>
          </div>
        )}
      </Link>
    </article>
  );
}
