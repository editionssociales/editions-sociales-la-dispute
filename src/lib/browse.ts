import { EDITION_LIST, isEditionSlug } from "./editions";
import { parseBookFilters, serializeBookFilters } from "./parse-filters";
import { PAGE_SIZE, type BookFilters, type BookSort } from "./types";

/**
 * Algèbre de navigation du catalogue — filtres ↔ URL ↔ pagination, en un seul
 * endroit pur et testable.
 *
 * `getBooks` renvoie tout ; `paginate` borne et découpe (l'off-by-one se teste
 * une fois). `catalogueHref` est l'unique encodeur d'URL (via
 * `serializeBookFilters`), et `withFilter/clearFilters/activeChips` laissent la
 * UI cliente parler en `BookFilters` dans les deux sens — plus de
 * `URLSearchParams` reconstruits à la main ni de dérivation de chips dupliquée.
 */

/* -------------------------------- pagination -------------------------------- */

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

/** Borne la page demandée dans `[1, totalPages]` puis découpe la fenêtre. */
export function paginate<T>(all: T[], page = 1, size: number = PAGE_SIZE): Page<T> {
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(page, 1), totalPages);
  return {
    items: all.slice((current - 1) * size, current * size),
    page: current,
    totalPages,
    total,
  };
}

/* ----------------------------------- URL ----------------------------------- */

/**
 * Unique encodeur d'URL de catalogue. `basePath` porte l'édition quand elle vit
 * dans le chemin (`/catalogue/<edition>`) — l'appelant retire alors
 * `filters.edition`. Les pages `page ≤ 1` sont omises par `serializeBookFilters`.
 */
export function catalogueHref(filters: BookFilters, basePath = "/catalogue"): string {
  const qs = serializeBookFilters(filters).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Lit des `URLSearchParams` (UI cliente) en filtres validés — inverse de
 * l'encodeur. Premier gagnant sur clé dupliquée, pour rester aligné sur
 * `params.get()` et sur le `parseBookFilters` serveur (qui prend `v[0]`).
 */
export function readFilters(params: URLSearchParams): BookFilters {
  const first: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (!(key in first)) first[key] = value;
  }
  return parseBookFilters(first);
}

/* ------------------------------- algèbre filtres ------------------------------- */

export type FilterField = "edition" | "collection" | "author" | "q" | "sort" | "upcoming";

const SORTS: BookSort[] = ["recent", "ancien", "titre"];

/**
 * Pose (ou retire, si la valeur est vide) un filtre et revient à la page 1 —
 * toute modification de filtre repart de la première page.
 */
export function withFilter(filters: BookFilters, field: FilterField, value: string): BookFilters {
  const next: BookFilters = { ...filters, page: undefined };
  switch (field) {
    case "edition":
      next.edition = value && isEditionSlug(value) ? value : undefined;
      break;
    case "collection":
      next.collection = value || undefined;
      break;
    case "author":
      next.author = value || undefined;
      break;
    case "q":
      next.q = value || undefined;
      break;
    case "sort":
      next.sort = SORTS.includes(value as BookSort) ? (value as BookSort) : undefined;
      break;
    case "upcoming":
      next.upcoming = value === "1" ? true : undefined;
      break;
  }
  return next;
}

/** Retire un filtre par son nom de paramètre d'URL (`q`, `edition`, `collection`, `author`, `upcoming`). */
export function withoutFilter(filters: BookFilters, param: string): BookFilters {
  return withFilter(filters, param as FilterField, "");
}

/** Efface tous les filtres en conservant le tri (« Tout effacer »). */
export function clearFilters(filters: BookFilters): BookFilters {
  return { sort: filters.sort };
}

/* --------------------------------- chips --------------------------------- */

/** Un filtre actif affiché en « chip ». */
export interface ActiveChip {
  param: string;
  type: string;
  label: string;
}

export interface ChipContext {
  collections: { slug: string; name: string }[];
  authors: { slug: string; name: string }[];
  /** Édition verrouillée par le chemin (pages `/catalogue/[edition]`) : pas de chip maison. */
  lockedEdition?: string;
}

/** Chips des filtres actifs — libellés repris des facettes et des maisons. */
export function activeChips(filters: BookFilters, ctx: ChipContext): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (filters.q) chips.push({ param: "q", type: "recherche", label: `« ${filters.q} »` });
  if (filters.edition && !ctx.lockedEdition) {
    const e = EDITION_LIST.find((x) => x.slug === filters.edition);
    chips.push({ param: "edition", type: "maison", label: e?.name ?? filters.edition });
  }
  if (filters.collection) {
    const c = ctx.collections.find((x) => x.slug === filters.collection);
    chips.push({ param: "collection", type: "thème", label: c?.name ?? filters.collection });
  }
  if (filters.author) {
    const a = ctx.authors.find((x) => x.slug === filters.author);
    chips.push({ param: "author", type: "auteur", label: a?.name ?? filters.author });
  }
  if (filters.upcoming) chips.push({ param: "upcoming", type: "statut", label: "À paraître" });
  return chips;
}
