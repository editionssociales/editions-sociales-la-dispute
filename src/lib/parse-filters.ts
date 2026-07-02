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
  };
}
