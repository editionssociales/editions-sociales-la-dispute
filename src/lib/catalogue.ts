import "server-only";
import { cache } from "react";
import { decodeEntities, displayAuthor, httpsify, parseWpDate } from "./format";
import { getAllStoreProducts, priceOf, slugFromBoutiqueLink, type WcProduct } from "./boutique";
import type {
  Book,
  BookDetail,
  BookFilters,
  Cover,
  EditionSlug,
  Facet,
  PurchaseStatus,
  Term,
} from "./types";

/**
 * Repository du catalogue unifié — mode WordPress *headless*.
 *
 * Fusionne en une seule liste :
 *  - les fiches livre des deux fonds (CPT `catalogue` via REST WP, taxonomies
 *    + champs ACF réexposés par le mu-plugin `wp-headless/es-headless-rest.php`) ;
 *  - les produits de la boutique WooCommerce (Store API), utilisés pour
 *    résoudre prix + disponibilité + lien d'achat, et pour ajouter au
 *    catalogue les quelques produits qui n'ont pas de fiche d'origine.
 *
 * Un livre n'est jamais retiré du catalogue faute d'être en vente : il est
 * simplement marqué « à paraître » ou « indisponible en ligne ».
 */

const SITES: Record<EditionSlug, string> = {
  "editions-sociales": process.env.WP_ES_URL || "https://editionssociales.fr",
  "la-dispute": process.env.WP_LD_URL || "https://ladispute.fr",
};
const REVALIDATE = Number(process.env.WP_REVALIDATE ?? "3600");

interface WpCoverField {
  url: string;
  width: number;
  height: number;
}
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
  /** Ancienne forme (string) tolérée pendant le déploiement du mu-plugin. */
  cover?: WpCoverField | string | null;
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

/** Ratio par défaut quand les dimensions réelles sont inconnues (rendu en `object-contain`, jamais recadré). */
const DEFAULT_COVER_RATIO = { width: 2, height: 3 };

function toCover(value?: WpCoverField | string | null): Cover | null {
  if (!value) return null;
  if (typeof value === "string") {
    // Ancienne forme du mu-plugin (avant redéploiement) : URL brute sans dimensions.
    const url = httpsify(value);
    return url ? { url, ...DEFAULT_COVER_RATIO } : null;
  }
  const url = httpsify(value.url);
  if (!url || !value.width || !value.height) return null;
  return { url, width: value.width, height: value.height };
}

function baseBook(edition: EditionSlug, item: WpBook): Book {
  const b = item.book ?? {};
  return {
    id: item.id,
    edition,
    origin: "catalogue",
    slug: item.slug,
    title: decodeEntities(item.title?.rendered ?? ""),
    authors: (b.authors ?? []).map((a) => ({
      name: displayAuthor(a.name),
      slug: a.slug,
    })),
    collection: b.collection ? { name: b.collection.name, slug: b.collection.slug } : null,
    isbn: b.isbn || null,
    price: toNumber(b.prix),
    pages: toNumber(b.pages),
    publishedAt: parseWpDate(b.date_parution ?? null),
    cover: toCover(b.cover),
    buy: {
      boutique: b.boutique || null,
      parislibrairies: b.parislibrairies || null,
      lalibrairie: b.lalibrairie || null,
    },
    status: "unavailable",
    permalink: null,
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
    out.push(...items.map((it) => baseBook(edition, it)));
    if (items.length < perPage) break;
  }
  return out;
}

/** Résout le statut d'achat d'un livre à partir du produit boutique associé. */
function resolvePurchase(
  book: Book,
  product: WcProduct | undefined,
): { status: PurchaseStatus; price: number | null; permalink: string | null; cover: Cover | null } {
  if (product && product.is_purchasable && product.is_in_stock) {
    return {
      status: "available",
      price: priceOf(product) ?? book.price,
      permalink: product.permalink,
      cover: book.cover ?? productCover(product),
    };
  }
  if (book.buy.parislibrairies || book.buy.lalibrairie) {
    return {
      status: "external",
      price: book.price,
      permalink: book.buy.parislibrairies || book.buy.lalibrairie,
      cover: book.cover,
    };
  }
  const upcoming = book.publishedAt != null && book.publishedAt > new Date().toISOString().slice(0, 10);
  return {
    status: upcoming ? "upcoming" : "unavailable",
    price: book.price,
    permalink: null,
    cover: book.cover,
  };
}

function productCover(p: WcProduct): Cover | null {
  const url = httpsify(p.images?.[0]?.src ?? null);
  // Dimensions inconnues côté Store API : ratio par défaut, rendu en `object-contain`.
  return url ? { url, ...DEFAULT_COVER_RATIO } : null;
}

/** Transforme un produit boutique sans fiche catalogue en entrée de catalogue minimale. */
function bookFromProduct(p: WcProduct): Book {
  return {
    id: p.id,
    edition: null,
    origin: "boutique",
    slug: p.slug,
    title: decodeEntities(p.name ?? ""),
    authors: [],
    collection: null,
    isbn: null,
    price: priceOf(p),
    pages: null,
    publishedAt: null,
    cover: productCover(p),
    buy: { boutique: p.permalink, parislibrairies: null, lalibrairie: null },
    status: p.is_purchasable && p.is_in_stock ? "available" : "unavailable",
    permalink: p.is_purchasable && p.is_in_stock ? p.permalink : null,
  };
}

/** Catalogue unifié : livres des deux fonds + produits boutique, fusionnés. */
export const getAllBooks = cache(async (): Promise<Book[]> => {
  const [siteBooks, products] = await Promise.all([
    Promise.all((Object.keys(SITES) as EditionSlug[]).map((e) => fetchSite(e))).then((p) => p.flat()),
    getAllStoreProducts().catch((err) => {
      console.error("[catalogue] boutique indisponible:", err);
      return [] as WcProduct[];
    }),
  ]);

  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const claimed = new Set<string>();

  const merged = siteBooks.map((book) => {
    const slug = slugFromBoutiqueLink(book.buy.boutique);
    const product = slug ? bySlug.get(slug) : undefined;
    if (product) claimed.add(product.slug);
    const resolved = resolvePurchase(book, product);
    return { ...book, ...resolved };
  });

  const extras = products.filter((p) => !claimed.has(p.slug)).map(bookFromProduct);
  return [...merged, ...extras];
});

const FILTER_KEYS = ["edition", "collection", "author", "q", "upcoming"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function matches(book: Book, filters: BookFilters, key: FilterKey): boolean {
  switch (key) {
    case "edition":
      return !filters.edition || book.edition === filters.edition;
    case "collection":
      return !filters.collection || book.collection?.slug === filters.collection;
    case "author":
      return !filters.author || book.authors.some((a) => a.slug === filters.author);
    case "q": {
      if (!filters.q) return true;
      const needle = filters.q.toLowerCase();
      return (
        book.title.toLowerCase().includes(needle) ||
        book.authors.some((a) => a.name.toLowerCase().includes(needle))
      );
    }
    case "upcoming":
      // Le statut est résolu par `resolvePurchase` (boutique + dates) avant tout filtrage.
      return !filters.upcoming || book.status === "upcoming";
  }
}

/** Filtre selon toutes les dimensions sauf celles listées dans `omit`. */
function filterBooks(books: Book[], filters: BookFilters, omit: FilterKey[] = []): Book[] {
  const active = FILTER_KEYS.filter((k) => !omit.includes(k));
  return books.filter((b) => active.every((k) => matches(b, filters, k)));
}

function sortBooks(books: Book[], sort: BookFilters["sort"] = "recent"): Book[] {
  return [...books].sort((a, b) => {
    if (sort === "titre") return a.title.localeCompare(b.title, "fr");
    const da = a.publishedAt ?? "";
    const db = b.publishedAt ?? "";
    return sort === "ancien" ? da.localeCompare(db) : db.localeCompare(da);
  });
}

/** Applique filtres + tri (pagination gérée par l'appelant). */
export async function getBooks(filters: BookFilters = {}): Promise<Book[]> {
  const all = await getAllBooks();
  return sortBooks(filterBooks(all, filters), filters.sort);
}

export async function getNewReleases(limit = 8): Promise<Book[]> {
  const books = await getBooks({ sort: "recent" });
  return books.slice(0, limit);
}

export async function countBooks(edition?: EditionSlug): Promise<number> {
  const books = await getAllBooks();
  return edition ? books.filter((b) => b.edition === edition).length : books.length;
}

function tally(books: Book[], terms: (b: Book) => Term[]): Facet[] {
  const acc = new Map<string, Facet>();
  for (const b of books) {
    for (const t of terms(b)) {
      const f = acc.get(t.slug) ?? { ...t, count: 0 };
      f.count += 1;
      acc.set(t.slug, f);
    }
  }
  return [...acc.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Facettes **dynamiques** : les options de chaque dimension sont calculées à
 * partir des livres qui correspondent à *toutes les autres* dimensions
 * actives — sélectionner une collection ne laisse dans la liste des auteurs
 * que ceux qui y publient, et inversement.
 */
export async function getFacets(
  filters: BookFilters = {},
): Promise<{ collections: Facet[]; authors: Facet[]; total: number }> {
  const all = await getAllBooks();
  const forCollections = filterBooks(all, filters, ["collection"]);
  const forAuthors = filterBooks(all, filters, ["author"]);
  return {
    collections: tally(forCollections, (b) => (b.collection ? [b.collection] : [])),
    authors: tally(forAuthors, (b) => b.authors),
    // Total de la cellule « Tous les livres » du menu thèmes : les mêmes livres
    // que la tally des collections (toutes les dimensions sauf collection),
    // pas `allBooks.length` qui serait déjà restreint si une collection est active.
    total: forCollections.length,
  };
}

/** Fiche complète d'un livre (par édition + slug). Absent pour un article boutique-only. */
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
  const book = baseBook(edition, item);

  const products = await getAllStoreProducts().catch(() => [] as WcProduct[]);
  const productSlug = slugFromBoutiqueLink(book.buy.boutique);
  const product = productSlug ? products.find((p) => p.slug === productSlug) : undefined;
  const resolved = resolvePurchase(book, product);

  return {
    ...book,
    ...resolved,
    presentation: item.content?.rendered ?? "",
    furtherReading: b.plus_loin || null,
    tocUrl: httpsify(b.table ?? null),
    excerptUrl: httpsify(b.extrait ?? null),
  };
}

/** Paramètres de génération statique pour les fiches (livres issus d'une fiche catalogue). */
export async function getAllBookParams(): Promise<
  { edition: EditionSlug; slug: string }[]
> {
  const books = await getAllBooks();
  return books
    .filter((b): b is Book & { edition: EditionSlug } => b.edition != null)
    .map((b) => ({ edition: b.edition, slug: b.slug }));
}
