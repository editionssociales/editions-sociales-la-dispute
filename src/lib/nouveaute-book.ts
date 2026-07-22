import { EDITIONS } from "./editions";
import type { Book, Cover, EditionSlug } from "./types";

/**
 * Un livre déjà mis en forme pour `NouveautesCarousel` — aucune fonction,
 * uniquement des données sérialisables. Partagé entre l'accueil (dernières
 * parutions) et la vue « à paraître » de `/catalogue` : mêmes règles
 * d'éligibilité et de mapping, un seul endroit qui les porte.
 */
export interface NouveauteBook {
  href: string;
  title: string;
  author: string;
  coverUrl: string;
  coverW: number;
  coverH: number;
  upcoming: boolean;
  /** Date de parution ISO — affichée dans la légende quand `upcoming`. */
  publishedAt: string | null;
  imprint: string;
}

/** Un livre est éligible au carrousel s'il a une couverture et une fiche d'origine (édition connue). */
export function readyForCarousel(
  book: Book,
): book is Book & { edition: EditionSlug; cover: Cover } {
  return book.cover != null && book.edition != null;
}

/** Mappe des `Book` du catalogue vers la forme attendue par `NouveautesCarousel`. */
export function toNouveauteBooks(books: Book[]): NouveauteBook[] {
  return books.filter(readyForCarousel).map((book) => ({
    href: `/catalogue/${book.edition}/${book.slug}`,
    title: book.title,
    author: book.authors.map((a) => a.name).join(", "),
    coverUrl: book.cover.url,
    coverW: book.cover.width,
    coverH: book.cover.height,
    upcoming: book.status === "upcoming",
    publishedAt: book.publishedAt,
    imprint: EDITIONS[book.edition].shortName,
  }));
}
