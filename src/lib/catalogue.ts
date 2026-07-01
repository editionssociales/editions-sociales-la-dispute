import "server-only";
import { cache } from "react";
import { decodeEntities, displayAuthor, httpsify, parseWpDate } from "./format";
import type {
  Book,
  BookDetail,
  BookFilters,
  EditionSlug,
  Facet,
  Term,
} from "./types";

/**
 * Repository du catalogue unifié — mode WordPress **headless** (V1).
 *
 * Les livres sont lus via l'API REST des deux WordPress historiques
 * (editionssociales.fr, ladispute.fr). Le CPT `catalogue` est exposé nativement ;
 * les taxonomies (auteur/collection/parution) et les champs ACF sont réexposés
 * par le mu-plugin `wp-headless/es-headless-rest.php` sous une clé `book`.
 *
 * Aucune écriture, cache HTTP côté Next (revalidation) → adapté à un
 * hébergement Vercel qui n'a pas d'accès direct aux bases OVH. La logique de
 * fusion (deux maisons dans un même catalogue) est inchangée.
 */

const SITES: Record<EditionSlug, string> = {
  "editions-sociales": process.env.WP_ES_URL || "https://editionssociales.fr",
  "la-dispute": process.env.WP_LD_URL || "https://ladispute.fr",
};
const REVALIDATE = Number(process.env.WP_REVALIDATE ?? "3600");

interface WpBookField {
  isbn?: string | null;
  prix?: string | number | null;
  pages?: string | number | null;
  date_parution?: string | null;
  plus_loin?: string | null;
  table?: string | null;
  extrait?: string | null;
  boutique?: string | null;
  parislibrairies?: string | null;
  lalibrairie?: string | null;
  authors?: Term[];
  collection?: Term | null;
  cover?: string | null;
}
interface WpBook {
  id: number;
  slug: string;
  title: { rendered: string };
  content?: { rendered: string };
  book?: WpBookField;
}

async function wpGet<T>(base: string, path: string): Promise<T> {
  const res = await fetch(`${base}/wp-json/wp/v2/${path}`, {
    next: { revalidate: REVALIDATE },
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`WP REST ${base}/${path} → ${res.status}`);
  return (await res.json()) as T;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function mapBook(edition: EditionSlug, item: WpBook): Book {
  const b = item.book ?? {};
  return {
    id: item.id,
    edition,
    slug: item.slug,
    title: decodeEntities(item.title?.rendered ?? ""),
    authors: (b.authors ?? []).map((a) => ({
      name: displayAuthor(a.name),
      slug: a.slug,
    })),
    collection: b.collection
      ? { name: b.collection.name, slug: b.collection.slug }
      : null,
    isbn: b.isbn || null,
    price: toNumber(b.prix),
    pages: toNumber(b.pages),
    publishedAt: parseWpDate(b.date_parution ?? null),
    coverUrl: httpsify(b.cover ?? null),
    buy: {
      boutique: b.boutique || null,
      parislibrairies: b.parislibrairies || null,
      lalibrairie: b.lalibrairie || null,
    },
  };
}

async function fetchSite(edition: EditionSlug): Promise<Book[]> {
  const base = SITES[edition];
  const perPage = 100;
  const out: Book[] = [];
  for (let page = 1; page <= 20; page++) {
    let items: WpBook[];
    try {
      items = await wpGet<WpBook[]>(
        base,
        `catalogue?per_page=${perPage}&page=${page}&orderby=date&order=desc&_fields=id,slug,title,book`,
      );
    } catch (err) {
      // 400 attendu au-delà de la dernière page ; on ne loggue qu'un vrai échec.
      if (page === 1) console.error(`[catalogue] ${edition} indisponible:`, err);
      break;
    }
    out.push(...items.map((it) => mapBook(edition, it)));
    if (items.length < perPage) break;
  }
  return out;
}

/** Tous les livres des deux catalogues (mémoïsé par requête). */
export const getAllBooks = cache(async (): Promise<Book[]> => {
  const parts = await Promise.all(
    (Object.keys(SITES) as EditionSlug[]).map((e) => fetchSite(e)),
  );
  return parts.flat();
});

/** Applique filtres + tri. */
export async function getBooks(filters: BookFilters = {}): Promise<Book[]> {
  let books = await getAllBooks();
  if (filters.edition) books = books.filter((b) => b.edition === filters.edition);
  if (filters.collection)
    books = books.filter((b) => b.collection?.slug === filters.collection);
  if (filters.author)
    books = books.filter((b) => b.authors.some((a) => a.slug === filters.author));
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    books = books.filter(
      (b) =>
        b.title.toLowerCase().includes(needle) ||
        b.authors.some((a) => a.name.toLowerCase().includes(needle)),
    );
  }
  const sort = filters.sort ?? "recent";
  return [...books].sort((a, b) => {
    if (sort === "titre") return a.title.localeCompare(b.title, "fr");
    const da = a.publishedAt ?? "";
    const db = b.publishedAt ?? "";
    return sort === "ancien" ? da.localeCompare(db) : db.localeCompare(da);
  });
}

export async function getNewReleases(limit = 8): Promise<Book[]> {
  const books = await getBooks({ sort: "recent" });
  return books.slice(0, limit);
}

export async function countBooks(edition?: EditionSlug): Promise<number> {
  const books = await getAllBooks();
  return edition ? books.filter((b) => b.edition === edition).length : books.length;
}

/** Facettes (collections, auteurs) calculées sur l'ensemble ou une édition. */
export async function getFacets(
  edition?: EditionSlug,
): Promise<{ collections: Facet[]; authors: Facet[] }> {
  const all = await getAllBooks();
  const books = edition ? all.filter((b) => b.edition === edition) : all;
  const collections = new Map<string, Facet>();
  const authors = new Map<string, Facet>();
  for (const b of books) {
    if (b.collection) {
      const f = collections.get(b.collection.slug) ?? { ...b.collection, count: 0 };
      f.count += 1;
      collections.set(b.collection.slug, f);
    }
    for (const a of b.authors) {
      const f = authors.get(a.slug) ?? { ...a, count: 0 };
      f.count += 1;
      authors.set(a.slug, f);
    }
  }
  const byName = (a: Facet, b: Facet) => a.name.localeCompare(b.name, "fr");
  return {
    collections: [...collections.values()].sort(byName),
    authors: [...authors.values()].sort(byName),
  };
}

/** Fiche complète d'un livre (par édition + slug). */
export async function getBook(
  edition: EditionSlug,
  slug: string,
): Promise<BookDetail | null> {
  const base = SITES[edition];
  let items: WpBook[];
  try {
    items = await wpGet<WpBook[]>(
      base,
      `catalogue?slug=${encodeURIComponent(slug)}&_fields=id,slug,title,content,book`,
    );
  } catch {
    return null;
  }
  if (!items.length) return null;
  const item = items[0];
  const b = item.book ?? {};
  return {
    ...mapBook(edition, item),
    presentation: item.content?.rendered ?? "",
    furtherReading: b.plus_loin || null,
    tocUrl: httpsify(b.table ?? null),
    excerptUrl: httpsify(b.extrait ?? null),
  };
}

/** Paramètres de génération statique pour les fiches. */
export async function getAllBookParams(): Promise<
  { edition: EditionSlug; slug: string }[]
> {
  const books = await getAllBooks();
  return books.map((b) => ({ edition: b.edition, slug: b.slug }));
}
