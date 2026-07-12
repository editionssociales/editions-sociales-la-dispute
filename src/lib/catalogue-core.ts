import { decodeEntities, displayAuthor, httpsify, parseWpDate } from "./format";
import { rebaseWpMediaUrl, sanitizeCms } from "./cms-html";
import { frenchTypo } from "./typo-fr";
import {
  priceOf,
  slugFromBoutiqueLink,
  type WcProduct,
  type WpBook,
  type WpCoverField,
} from "./catalogue-source";
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
 * Cœur du catalogue unifié — **pur**, sans I/O ni rendu.
 *
 * Fusionne les fiches livre des deux fonds (WordPress) avec les produits
 * boutique (WooCommerce), résout prix / disponibilité / lien d'achat, puis
 * expose filtre, tri et facettes. Un livre n'est jamais retiré faute d'être en
 * vente : il est « à paraître » ou « indisponible en ligne ». Toute cette
 * logique se teste avec des fixtures, à travers le port `CatalogueSource`.
 */

/* -------------------------- transformation brut → domaine -------------------------- */

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
    // Découplage CMS (E3) : rebase vers cms-es/cms-ld avant le flip DNS.
    return url ? { url: rebaseWpMediaUrl(url), ...DEFAULT_COVER_RATIO } : null;
  }
  const url = httpsify(value.url);
  if (!url || !value.width || !value.height) return null;
  return { url: rebaseWpMediaUrl(url), width: value.width, height: value.height };
}

/** Fiche livre brute (WordPress) → `Book` de base, statut non encore résolu. */
export function toBook(edition: EditionSlug, item: WpBook): Book {
  const b = item.book ?? {};
  return {
    id: item.id,
    edition,
    origin: "catalogue",
    slug: item.slug,
    // Orthotypo française (E6 du plan) : les titres ne passent pas par
    // `sanitizeCms`/`textFilter` (pas de HTML ici) — on l'applique donc
    // directement, après décodage des entités.
    title: frenchTypo(decodeEntities(item.title?.rendered ?? "")),
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

function productCover(p: WcProduct): Cover | null {
  const url = httpsify(p.images?.[0]?.src ?? null);
  // Dimensions inconnues côté Store API : ratio par défaut, rendu en `object-contain`.
  return url ? { url, ...DEFAULT_COVER_RATIO } : null;
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

/**
 * Catalogue unifié : livres des deux fonds + produits boutique, fusionnés. Les
 * fonds sont parcourus dans l'ordre d'insertion de `rawByEdition`.
 */
export function buildCatalogue(
  rawByEdition: Partial<Record<EditionSlug, WpBook[]>>,
  products: WcProduct[],
): Book[] {
  const siteBooks: Book[] = [];
  for (const edition of Object.keys(rawByEdition) as EditionSlug[]) {
    for (const item of rawByEdition[edition] ?? []) siteBooks.push(toBook(edition, item));
  }

  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const claimed = new Set<string>();

  const merged = siteBooks.map((book) => {
    const slug = slugFromBoutiqueLink(book.buy.boutique);
    const product = slug ? bySlug.get(slug) : undefined;
    if (product) claimed.add(product.slug);
    return { ...book, ...resolvePurchase(book, product) };
  });

  const extras = products.filter((p) => !claimed.has(p.slug)).map(bookFromProduct);
  return [...merged, ...extras];
}

/* ------------------------------- requêtes ------------------------------- */

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

/** Applique filtres + tri (pagination gérée par l'appelant, cf. `lib/browse`). */
export function queryBooks(all: Book[], filters: BookFilters = {}): Book[] {
  return sortBooks(filterBooks(all, filters), filters.sort);
}

export function newReleases(books: Book[], limit = 8): Book[] {
  return books.slice(0, limit);
}

export function countByEdition(books: Book[], edition?: EditionSlug): number {
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
export function computeFacets(
  all: Book[],
  filters: BookFilters = {},
): { collections: Facet[]; authors: Facet[]; total: number } {
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

/** Fiche complète d'un livre : base + statut résolu + contenus riches nettoyés (`SafeHtml`). */
export function buildBookDetail(
  edition: EditionSlug,
  item: WpBook,
  products: WcProduct[],
): BookDetail {
  const b = item.book ?? {};
  const book = toBook(edition, item);
  const productSlug = slugFromBoutiqueLink(book.buy.boutique);
  const product = productSlug ? products.find((p) => p.slug === productSlug) : undefined;
  const resolved = resolvePurchase(book, product);

  return {
    ...book,
    ...resolved,
    presentation: sanitizeCms(item.content?.rendered ?? ""),
    furtherReading: b.plus_loin ? sanitizeCms(b.plus_loin) : null,
    tocUrl: httpsify(b.table ?? null),
    excerptUrl: httpsify(b.extrait ?? null),
  };
}
