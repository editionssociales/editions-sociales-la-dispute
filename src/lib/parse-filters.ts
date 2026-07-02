import { isEditionSlug } from "./editions";
import type { BookFilters, BookSort } from "./types";

type SearchParams = Record<string, string | string[] | undefined>;

const SORTS: BookSort[] = ["recent", "ancien", "titre"];

/** Convertit des `searchParams` Next.js en filtres de catalogue validés. */
export function parseBookFilters(sp: SearchParams): BookFilters {
  const one = (key: string): string | undefined => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const edition = one("edition");
  const sort = one("sort");
  const page = Number(one("page"));
  return {
    edition: edition && isEditionSlug(edition) ? edition : undefined,
    collection: one("collection") || undefined,
    author: one("author") || undefined,
    q: one("q") || undefined,
    sort: SORTS.includes(sort as BookSort) ? (sort as BookSort) : undefined,
    page: Number.isInteger(page) && page > 0 ? page : undefined,
    upcoming: one("upcoming") === "1" ? true : undefined,
  };
}

/**
 * Sérialise des filtres de catalogue en paramètres d'URL — inverse de
 * `parseBookFilters`. Centralise la reconstruction des query strings
 * (pagination, cellules du menu thèmes, chips) pour que chaque filtre,
 * `upcoming` compris, soit toujours encodé de la même façon.
 */
export function serializeBookFilters(filters: BookFilters): URLSearchParams {
  const entries: [string, string][] = [];
  if (filters.edition) entries.push(["edition", filters.edition]);
  if (filters.collection) entries.push(["collection", filters.collection]);
  if (filters.author) entries.push(["author", filters.author]);
  if (filters.q) entries.push(["q", filters.q]);
  if (filters.sort) entries.push(["sort", filters.sort]);
  if (filters.upcoming) entries.push(["upcoming", "1"]);
  if (filters.page && filters.page > 1) entries.push(["page", String(filters.page)]);
  return new URLSearchParams(entries);
}
