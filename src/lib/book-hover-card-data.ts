import { cmsExcerpt } from "./cms-html";
import { EDITIONS } from "./editions";
import { formatPrice } from "./format";
import type { BookDetail } from "./types";

/**
 * DTO sérialisable de la mini fiche livre au survol (`BookHoverCard`,
 * `src/components/book-hover-card.tsx`) — tout est préformaté ICI (prix,
 * extrait, libellé de maison) pour que le composant client reste purement
 * présentationnel, sans jamais importer `server-only` ni Payload. Le type vit
 * dans `src/lib` et non dans le composant : `src/lib` possède le modèle de
 * données (même posture que `NouveauteBook`/`toNouveauteBooks`), les
 * composants le consomment — jamais l'inverse.
 *
 * Deux fabricants distincts produisent CE MÊME DTO : `toBookHoverCardData`
 * ci-dessous (depuis un `BookDetail` du pipeline catalogue) et
 * `contreparties.ts` (depuis SA propre lecture Payload brute, hors pipeline
 * catalogue — fiches brouillon comprises). Même forme, jamais de 3ᵉ source.
 */
export interface BookHoverCardData {
  title: string;
  /** Noms joints (« A, B ») — vide → `null`, jamais une chaîne vide affichée. */
  authors: string | null;
  /** « Les Éditions sociales » / « La Dispute » — `null` pour un article boutique-seul (sans maison). */
  editionLabel: string | null;
  /** Noms des libellés — chips non cliquables de la carte. */
  libelles: string[];
  /** Déjà formaté (`formatPrice`) — `null` si le livre n'a pas de prix. */
  priceLabel: string | null;
  /** Déjà tronqué (`BOOK_HOVER_EXCERPT_MAX`) — `null` si la fiche n'a aucune présentation. */
  excerpt: string | null;
  coverUrl: string | null;
}

/** Longueur de troncature de l'extrait de la carte — même valeur pour les deux fabricants (ci-dessous et `contreparties.ts`). */
export const BOOK_HOVER_EXCERPT_MAX = 220;

/**
 * Une fiche a-t-elle quoi que ce soit d'utile à montrer au-delà du titre nu ?
 * Sans prix, extrait ni auteurs, la carte serait vide de tout ce qui la
 * distingue du titre déjà affiché par l'appelant — c'est à LUI de décider
 * alors de ne pas ouvrir de survol du tout (`fiche: null`), jamais à
 * `BookHoverCard` de le découvrir après coup.
 */
export function isUsefulBookHoverCardData(
  data: Pick<BookHoverCardData, "priceLabel" | "excerpt" | "authors">,
): boolean {
  return data.priceLabel != null || data.excerpt != null || data.authors != null;
}

/**
 * Construit la mini fiche d'un livre du catalogue depuis sa fiche complète
 * (`BookDetail`, déjà résolue par `catalogue-core.ts` — présentation déjà
 * passée par le parachute legacy/Lexical PUIS `sanitizeCms`, pas besoin de
 * les rejouer ici). Point d'entrée pour tout futur survol catalogue (« vous
 * pourriez aussi aimer », panier…) au-delà du premier branchement
 * (contreparties, qui construit SA propre `BookHoverCardData` en
 * `contreparties.ts` — source différente, même DTO).
 */
export function toBookHoverCardData(detail: BookDetail): BookHoverCardData {
  const authors = detail.authors.length > 0 ? detail.authors.map((a) => a.name).join(", ") : null;
  const excerpt = detail.presentation ? cmsExcerpt(detail.presentation, BOOK_HOVER_EXCERPT_MAX) || null : null;
  return {
    title: detail.title,
    authors,
    editionLabel: detail.edition ? EDITIONS[detail.edition].name : null,
    libelles: detail.libelles.map((l) => l.name),
    priceLabel: formatPrice(detail.price),
    excerpt,
    coverUrl: detail.cover?.url ?? null,
  };
}
