import type { Book, EditionSlug, Facet } from "./types";
import {
  findToken,
  foldSearchText,
  foldSearchTextWithMap,
  highlightRanges,
  tokenizeSearchQuery,
  type FoldedText,
  type HighlightRange,
} from "./search-text";

/**
 * Cœur PUR de la complétion de la barre de recherche catalogue (titres,
 * auteurs, libellés) — le pendant « suggestions » du filtre `q` de
 * `catalogue-core`, avec la MÊME règle d'appariement (`search-text`).
 *
 * Découpage en trois temps, pensé pour un filtrage client à chaque frappe :
 *  1. `buildSuggestionIndexData` (serveur) projette le catalogue en un index
 *     JSON léger, servi par `GET /api/catalogue/suggestions` ;
 *  2. `prepareSuggestionIndex` (client, une fois à la réception) plie chaque
 *     champ une seule fois ;
 *  3. `querySuggestions` (client, à chaque frappe) n'a plus qu'à chercher les
 *     jetons dans des chaînes déjà pliées — ~300 fiches, aucun réseau, la
 *     fluidité d'un filtrage en mémoire.
 */

/* --------------------------------- index --------------------------------- */

/** Entrée livre de l'index (projection sérialisable de `Book`). */
export interface SuggestionBook {
  title: string;
  /** Noms d'affichage (« Prénom Nom »), pour l'appariement ET la ligne secondaire. */
  authors: string[];
  /** Noms des libellés — appariement seulement (cohérence avec le filtre `q` de la grille). */
  libelles: string[];
  edition: EditionSlug;
  slug: string;
}

/** Auteur ou libellé de l'index — facette globale + fonds où le terme apparaît. */
export interface SuggestionTerm extends Facet {
  editions: EditionSlug[];
}

export interface SuggestionIndexData {
  books: SuggestionBook[];
  authors: SuggestionTerm[];
  libelles: SuggestionTerm[];
}

/** Index vide — l'état dégradé de la route (complétion absente, recherche intacte). */
export function emptySuggestionIndexData(): SuggestionIndexData {
  return { books: [], authors: [], libelles: [] };
}

interface TermAccumulator {
  name: string;
  slug: string;
  count: number;
  editions: Set<EditionSlug>;
}

function tallyTerms(
  into: Map<string, TermAccumulator>,
  terms: { name: string; slug: string }[],
  edition: EditionSlug,
): void {
  for (const term of terms) {
    const entry = into.get(term.slug) ?? {
      name: term.name,
      slug: term.slug,
      count: 0,
      editions: new Set<EditionSlug>(),
    };
    entry.count += 1;
    entry.editions.add(edition);
    into.set(term.slug, entry);
  }
}

function toSuggestionTerms(acc: Map<string, TermAccumulator>): SuggestionTerm[] {
  return [...acc.values()]
    .map(({ editions, ...term }) => ({ ...term, editions: [...editions].sort() }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
}

/**
 * Projette le jeu de fiches catalogue (`getCatalogueBooks`) en index de
 * complétion. Les livres sortent par parution décroissante (à requête égale,
 * une parution récente prime) ; auteurs et libellés par nombre de fiches
 * décroissant — l'ordre de l'index EST l'ordre de départage de
 * `querySuggestions`.
 */
export function buildSuggestionIndexData(books: Book[]): SuggestionIndexData {
  const authors = new Map<string, TermAccumulator>();
  const libelles = new Map<string, TermAccumulator>();
  const dated: { entry: SuggestionBook; publishedAt: string }[] = [];

  for (const book of books) {
    // Défensif : l'appelant passe le jeu catalogue (jamais de boutique-seul),
    // dont l'édition est toujours résolue.
    if (book.edition === null) continue;
    dated.push({
      entry: {
        title: book.title,
        authors: book.authors.map((a) => a.name),
        libelles: book.libelles.map((l) => l.name),
        edition: book.edition,
        slug: book.slug,
      },
      publishedAt: book.publishedAt ?? "",
    });
    tallyTerms(authors, book.authors, book.edition);
    tallyTerms(libelles, book.libelles, book.edition);
  }

  const entries = dated
    .sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.entry.title.localeCompare(b.entry.title, "fr"),
    )
    .map((d) => d.entry);

  return {
    books: entries,
    authors: toSuggestionTerms(authors),
    libelles: toSuggestionTerms(libelles),
  };
}

/* ------------------------------- préparation ------------------------------ */

interface PreparedBook {
  data: SuggestionBook;
  /** Champs pliés pour l'appariement : titre, puis chaque auteur, puis chaque libellé. */
  title: string;
  others: string[];
  /** Formes pliées AVEC correspondance, pour surligner les deux chaînes affichées. */
  titleMap: FoldedText;
  authorsLabel: string;
  authorsLabelMap: FoldedText;
}

interface PreparedTerm {
  data: SuggestionTerm;
  name: string;
  nameMap: FoldedText;
}

export interface PreparedSuggestionIndex {
  books: PreparedBook[];
  authors: PreparedTerm[];
  libelles: PreparedTerm[];
}

function prepareTerm(term: SuggestionTerm): PreparedTerm {
  return { data: term, name: foldSearchText(term.name), nameMap: foldSearchTextWithMap(term.name) };
}

/** Plie l'index une fois pour toutes — à faire à la réception, jamais par frappe. */
export function prepareSuggestionIndex(data: SuggestionIndexData): PreparedSuggestionIndex {
  return {
    books: data.books.map((book) => {
      const authorsLabel = book.authors.join(", ");
      return {
        data: book,
        title: foldSearchText(book.title),
        others: [...book.authors, ...book.libelles].map(foldSearchText),
        titleMap: foldSearchTextWithMap(book.title),
        authorsLabel,
        authorsLabelMap: foldSearchTextWithMap(authorsLabel),
      };
    }),
    authors: data.authors.map(prepareTerm),
    libelles: data.libelles.map(prepareTerm),
  };
}

/* -------------------------------- requêtes -------------------------------- */

export type SuggestionKind = "title" | "author" | "libelle";

export interface SuggestedTitle {
  kind: "title";
  title: string;
  titleRanges: HighlightRange[];
  authorsLabel: string;
  authorsRanges: HighlightRange[];
  edition: EditionSlug;
  slug: string;
  href: string;
}

export interface SuggestedTerm {
  kind: "author" | "libelle";
  name: string;
  ranges: HighlightRange[];
  slug: string;
}

export interface SearchSuggestions {
  titles: SuggestedTitle[];
  authors: SuggestedTerm[];
  libelles: SuggestedTerm[];
  count: number;
}

/**
 * Bornes d'affichage par groupe — TROIS titres seulement (retour
 * 2026-08-30) : le dropdown est un raccourci, pas la liste des résultats (la
 * grille en dessous l'est, à la validation) — plafonner les titres garde les
 * groupes Auteurs et Libellés visibles d'un coup d'œil, sans dérouler.
 */
const MAX_TITLE_SUGGESTIONS = 3;
const MAX_AUTHOR_SUGGESTIONS = 3;
const MAX_LIBELLE_SUGGESTIONS = 2;

/**
 * Classement d'une entrée, du plus fort au plus faible :
 *  0 — chaque jeton ouvre un mot du champ PRINCIPAL (titre / nom) ;
 *  1 — chaque jeton ouvre un mot quelque part ;
 *  2 — simple sous-chaîne. `null` : un jeton ne s'apparie nulle part.
 */
function rankEntry(tokens: string[], main: string, others: string[]): number | null {
  let rank = 0;
  for (const token of tokens) {
    const inMain = findToken(main, token);
    if (inMain?.atWordStart) continue;
    const hits = [inMain, ...others.map((field) => findToken(field, token))].filter(
      (hit) => hit !== null,
    );
    if (hits.length === 0) return null;
    rank = Math.max(rank, hits.some((hit) => hit.atWordStart) ? 1 : 2);
  }
  return rank;
}

function rankAndSlice<T>(
  entries: T[],
  tokens: string[],
  fieldsOf: (entry: T) => { main: string; others: string[] },
  limit: number,
): T[] {
  const ranked: { entry: T; rank: number }[] = [];
  for (const entry of entries) {
    const { main, others } = fieldsOf(entry);
    const rank = rankEntry(tokens, main, others);
    if (rank !== null) ranked.push({ entry, rank });
  }
  // Tri STABLE (contrat ES2019) : à rang égal, l'ordre de l'index départage
  // (parution récente pour les livres, count pour les termes).
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.entry);
}

/** Permalien d'une fiche catalogue — même forme littérale que `buildNativeCatalogue`. */
function titleHref(book: SuggestionBook): string {
  return `/catalogue/${book.edition}/${book.slug}`;
}

/**
 * Suggestions pour une frappe — filtrage en mémoire sur l'index préparé.
 * `edition` (pages `/catalogue/[edition]`) restreint les trois groupes au
 * fonds verrouillé. Requête vide ou blanche : aucun groupe.
 */
export function querySuggestions(
  index: PreparedSuggestionIndex,
  query: string,
  { edition }: { edition?: EditionSlug } = {},
): SearchSuggestions {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return { titles: [], authors: [], libelles: [], count: 0 };

  const scopedBooks = edition ? index.books.filter((b) => b.data.edition === edition) : index.books;
  const scopedTerms = (terms: PreparedTerm[]) =>
    edition ? terms.filter((t) => t.data.editions.includes(edition)) : terms;

  const authors = rankAndSlice(
    scopedTerms(index.authors),
    tokens,
    (t) => ({ main: t.name, others: [] }),
    MAX_AUTHOR_SUGGESTIONS,
  );
  const libelles = rankAndSlice(
    scopedTerms(index.libelles),
    tokens,
    (t) => ({ main: t.name, others: [] }),
    MAX_LIBELLE_SUGGESTIONS,
  );
  const titles = rankAndSlice(
    scopedBooks,
    tokens,
    (b) => ({ main: b.title, others: b.others }),
    MAX_TITLE_SUGGESTIONS,
  );

  const toTerm = (kind: "author" | "libelle") => (term: PreparedTerm): SuggestedTerm => ({
    kind,
    name: term.data.name,
    ranges: highlightRanges(term.nameMap, tokens),
    slug: term.data.slug,
  });

  const result: SearchSuggestions = {
    titles: titles.map((book) => ({
      kind: "title",
      title: book.data.title,
      titleRanges: highlightRanges(book.titleMap, tokens),
      authorsLabel: book.authorsLabel,
      authorsRanges: highlightRanges(book.authorsLabelMap, tokens),
      edition: book.data.edition,
      slug: book.data.slug,
      href: titleHref(book.data),
    })),
    authors: authors.map(toTerm("author")),
    libelles: libelles.map(toTerm("libelle")),
    count: 0,
  };
  result.count = result.titles.length + result.authors.length + result.libelles.length;
  return result;
}
