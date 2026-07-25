import type { ReactNode } from "react";
import type { Book } from "@/lib/types";
import Link from "next/link";
import { ShelfLock } from "@/components/shelf-lock";
import { ShelfCover } from "@/components/shelf-cover";
import { BookCover, coverAspectRatio } from "@/lib/cover";
import { ACCENTS, ACCENT_BG as BG } from "@/lib/accents";
import { FOCUS_RING_LIGHT_OUTER } from "@/lib/ui";

/**
 * Étagère 3D de l'ask `/souscription` et son repli mobile — module colocalisé
 * privé (`_components`, hors routing App Router), composants serveur
 * uniquement. Les deux étagères plafonnent elles-mêmes leur contenu (11 dos
 * dessinés / 8 couvertures) : l'appelant passe simplement ses parutions
 * filtrées.
 */

// Étagère de l'ask : dimensions en pixels des dos de livres dessinés.
const SPINES: { h: number; w: number }[] = [
  { h: 88, w: 24 },
  { h: 120, w: 32 },
  { h: 72, w: 20 },
  { h: 132, w: 28 },
  { h: 96, w: 36 },
  { h: 148, w: 24 },
  { h: 108, w: 28 },
  { h: 84, w: 20 },
  { h: 136, w: 32 },
  { h: 100, w: 24 },
  { h: 116, w: 28 },
];
const SHELF_GAP = 6; // = gap-1.5 entre les dos

/**
 * Hauteur uniforme (px) du livre déplié au survol. Les dos gardent leur
 * hauteur variée au repos (l'étagère), mais tous les livres atteignent cette
 * hauteur une fois sortis — grand format, pour bien présenter la couverture.
 * Voir --bh dans .book3d-inner (globals.css).
 */
const BOOK_HOVER_H = 320;

/** Nombre de couvertures dans le repli mobile (grille 2×4, R7 — l'étagère 3D
 *  ne peut pas disparaître sous `lg` sur une page dont le trafic de campagne
 *  sera majoritairement mobile). */
const MOBILE_SHELF_COUNT = 8;

/**
 * Étagère de l'ask : chaque dos dessiné porte une parution récente réelle. Au
 * survol ou au focus clavier, le livre sort du rayon en 3D : il pivote sur
 * l'arête de sa reliure (bord droit du dos) pour présenter sa couverture,
 * qui glisse vers le haut-gauche hors de l'étagère (translateX/Y/Z + rotateY
 * -78deg, cf. .book3d* dans globals.css). Titre, auteur et collection
 * apparaissent en typo nue sous la barre de l'étagère. CSS pur, aucun JS
 * client. L'étagère vit sous le titre de l'ask, sur fond paper (maquette
 * 25/07) : la couverture dépliée peut recouvrir temporairement le titre
 * au-dessus — même comportement que dans l'ex-héros, où elle glissait vers
 * la colonne de texte.
 *
 * `trailing` : contenu posé SUR le rayon, dans l'espace libre à droite du
 * dernier dos (la place des prochains livres) — l'ask y met la demande du
 * slogan. Rendu plein-flex aligné sur la base des dos ; padding/typo à la
 * charge de l'appelant (convention primitives).
 */
export function HeroShelf({ books, trailing }: { books: Book[]; trailing?: ReactNode }) {
  // Décalage de chaque dos par rapport au bord gauche de l'étagère, pour
  // ancrer le bloc de texte au même endroit quel que soit le dos survolé.
  const leftOffsets = SPINES.map((_, i) =>
    SPINES.slice(0, i).reduce((acc, s) => acc + s.w + SHELF_GAP, 0),
  );
  return (
    <ShelfLock className="hidden lg:block">
      <div className="flex items-end gap-1.5">
        {SPINES.map((s, i) => {
          const book = books[i];
          // Garde locale (pas seulement le filtre de l'appelant) : cover ET
          // edition requis pour un dos cliquable — sinon dos placeholder.
          if (!book?.cover || !book.edition) {
            return (
              <div
                key={i}
                aria-hidden="true"
                className={`shrink-0 ${BG[ACCENTS[i % 4]]} animate-[spine-rise_0.7s_ease-out_both]`}
                style={{ width: s.w, height: s.h, animationDelay: `${i * 70}ms` }}
              />
            );
          }
          return (
            // Anneau focus fait main (exception R5) : les dos font 20-36px de
            // large, un anneau EXTÉRIEUR (FOCUS_RING_*_OUTER) y déborderait
            // de 20-36px ; ocher INTÉRIEUR contraste sur la couverture sans
            // jamais dépasser du dos (choix de cadrage d'origine).
            <Link
              key={book.id}
              href={`/catalogue/${book.edition}/${book.slug}`}
              className={`book3d${i < 2 ? " book3d--edge" : ""} relative block shrink-0 animate-[spine-rise_0.7s_ease-out_both] focus-visible:z-30 focus-visible:outline-[3px] focus-visible:outline-ocher focus-visible:outline-offset-[-3px]`}
              style={{ width: s.w, height: s.h, animationDelay: `${i * 70}ms` }}
            >
              <span className="sr-only">
                {book.title}
                {book.authors[0] ? `, ${book.authors[0].name}` : ""}
              </span>
              {/* Titre, auteur, collection — fondu sous la barre de l'étagère.
                  Affiché quand le dos est ouvert (classe is-open pilotée par
                  ShelfLock) ou au focus clavier ; cf. .book3d-cap (globals.css). */}
              <span
                className="book3d-cap pointer-events-none absolute z-10 block w-[340px] opacity-0 transition-opacity duration-300 motion-reduce:transition-none"
                style={{ left: -leftOffsets[i], top: "calc(100% + 16px)" }}
                aria-hidden="true"
              >
                <span className="block font-serif text-sm font-semibold text-ink">
                  {book.title}
                </span>
                {book.authors.length > 0 && (
                  <span className="block text-sm text-ink/70">
                    {book.authors.map((a) => a.name).join(", ")}
                  </span>
                )}
                {book.libelles.length > 0 && (
                  <span className="mt-0.5 block text-xs tracking-wide text-ink/50">
                    {book.libelles.map((l) => l.name).join(" · ")}
                  </span>
                )}
              </span>
              {/* Sortie 3D : le dos pivote sur son arête de reliure pour présenter sa couverture */}
              <div
                className="book3d-inner"
                style={
                  {
                    "--w": `${s.w}px`,
                    "--h": `${s.h}px`,
                    "--bh": `${BOOK_HOVER_H}px`,
                  } as React.CSSProperties
                }
              >
                <div className={`book3d-spine ${BG[ACCENTS[i % 4]]}`} />
                {/* La face couverture adopte le format exact de l'image : ratio
                    DB au rendu serveur, ratio réel dès le chargement. */}
                <ShelfCover url={book.cover.url} ratio={coverAspectRatio(book.cover)} />
              </div>
            </Link>
          );
        })}
        {trailing && <div className="min-w-0 flex-1">{trailing}</div>}
      </div>
      <div className="h-[3px] bg-ink/25" />
      {/* Zone réservée sous la barre : l'encart titre/auteur/collection du dos
          ouvert s'y affiche (positionné en absolu depuis chaque lien). */}
      <div aria-hidden="true" className="h-20" />
    </ShelfLock>
  );
}

/**
 * Repli mobile de l'étagère (sous `lg`, où `HeroShelf` est masquée) : une
 * grille 2×4 de vraies couvertures cliquables plutôt qu'un simple texte —
 * l'atout le plus travaillé de la page ne peut pas disparaître pour la
 * majorité du trafic de la campagne. Toujours via `BookCover` : jamais
 * recadrée (`src/components/CLAUDE.md`), donc pas de grille à hauteur de
 * cellule forcée.
 */
export function MobileShelf({ books }: { books: Book[] }) {
  // Même invariant que HeroShelf : couverture + fiche interne requises.
  const items = books.filter((b) => b.cover && b.edition).slice(0, MOBILE_SHELF_COUNT);
  if (items.length === 0) return null;
  return (
    <div
      // Pas de marge propre : la disposition est l'affaire de l'appelant
      // (convention primitives, src/components/CLAUDE.md) — c'est le bandeau
      // séparateur de page.tsx qui porte les espacements.
      className="grid grid-cols-4 items-start gap-[2px] bg-ink/15 p-[2px] lg:hidden"
      role="group"
      aria-label="Dernières parutions"
    >
      {items.map((book) => (
        <Link
          key={book.id}
          href={`/catalogue/${book.edition}/${book.slug}`}
          // Anneau EXTÉRIEUR (R5) : posé sur le fond paper de la bande, pas
          // sur la couverture elle-même — outline ink y contraste, et l'anneau
          // ne recouvre jamais l'image.
          className={`group relative block bg-paper-2 ${FOCUS_RING_LIGHT_OUTER}`}
        >
          <span className="sr-only">
            {book.title}
            {book.authors[0] ? `, ${book.authors[0].name}` : ""}
          </span>
          <BookCover
            cover={book.cover}
            title={book.title}
            alt=""
            fit="width"
            sizes="25vw"
            className="block h-auto w-full transition-opacity group-hover:opacity-90 group-focus-within:opacity-90 motion-reduce:transition-none"
          />
        </Link>
      ))}
    </div>
  );
}
