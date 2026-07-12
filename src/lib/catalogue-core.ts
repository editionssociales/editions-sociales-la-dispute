import { decodeEntities, httpsify } from "./format";
import { sanitizeCms } from "./cms-html";
import { frenchTypo } from "./typo-fr";
import {
  priceOf,
  slugFromBoutiqueLink,
  type CommerceInfo,
  type RawBook,
  type WcProduct,
} from "./catalogue-source";
import type {
  Book,
  BookDetail,
  BookFilters,
  Cover,
  EditionSlug,
  Facet,
  PurchaseMode,
  PurchaseStatus,
  Term,
} from "./types";

/**
 * Cœur du catalogue unifié — **pur**, sans I/O ni rendu, et sans dialecte de
 * source (le fil WordPress vit dans `catalogue-wp-map.ts`, l'enveloppe Payload
 * dans `catalogue-pg-map.ts`).
 *
 * Fusionne les fiches livre des deux fonds avec les produits boutique
 * (WooCommerce), résout prix / disponibilité / lien d'achat, puis expose
 * filtre, tri et facettes. Un livre n'est jamais retiré faute d'être en
 * vente : il est « à paraître » ou « indisponible en ligne ». Toute cette
 * logique se teste avec des fixtures, à travers le port `CatalogueSource`.
 */

/* -------------------------- transformation brut → domaine -------------------------- */

/**
 * Fiche brute du port → `Book` de base, statut non encore résolu. `origin`
 * par défaut à `"catalogue"` (comportement historique, inchangé pour tous
 * les appels à deux arguments) — un troisième argument permet de fabriquer
 * un article boutique-seul natif (`edition: null, origin: "boutique"`, cf.
 * `buildNativeCatalogue`) sans dupliquer cette fonction.
 */
export function toBook(
  edition: EditionSlug | null,
  raw: RawBook,
  origin: Book["origin"] = "catalogue",
): Book {
  return {
    id: raw.id,
    edition,
    origin,
    slug: raw.slug,
    // Orthotypo française (E6 du plan) : indépendante de la source — un titre
    // saisi dans Payload mérite ses insécables autant qu'un titre WordPress.
    title: frenchTypo(raw.title),
    authors: raw.authors,
    collection: raw.collection,
    isbn: raw.isbn,
    price: raw.price,
    pages: raw.pages,
    publishedAt: raw.publishedAt,
    cover: raw.cover,
    buy: raw.buy,
    status: "unavailable",
    permalink: null,
    // Par défaut « lien externe » (comportement historique) — le seul appelant
    // qui pose `"cart"` est `resolveNativePurchase`, en aval.
    purchaseMode: "legacy-link",
  };
}

function productCover(p: WcProduct): Cover | null {
  const url = httpsify(p.images?.[0]?.src ?? null);
  // Dimensions inconnues côté Store API : ratio par défaut, rendu en `object-contain`.
  return url ? { url, width: 2, height: 3 } : null;
}

/** Un livre à date de parution future est-il « à paraître » ? Aujourd'hui en ISO `YYYY-MM-DD`, comparaison lexicographique valide sur ce format. */
function isUpcoming(publishedAt: string | null): boolean {
  return publishedAt != null && publishedAt > new Date().toISOString().slice(0, 10);
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
  return {
    status: isUpcoming(book.publishedAt) ? "upcoming" : "unavailable",
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
    purchaseMode: "legacy-link",
  };
}

/**
 * Catalogue unifié : livres des deux fonds + produits boutique, fusionnés. Les
 * fonds sont parcourus dans l'ordre d'insertion de `rawByEdition`.
 */
export function buildCatalogue(
  rawByEdition: Partial<Record<EditionSlug, RawBook[]>>,
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

/* --------------------------- commerce natif (COMMERCE_NATIVE=1) --------------------------- */

/**
 * Défaut conservateur quand une fiche n'a pas (encore) de groupe `commerce`
 * Payload — jamais vendable, stock non suivi. Fait retomber
 * `resolveNativePurchase` sur la branche « lien externe / indisponible »,
 * jamais sur « disponible » : une fiche sans donnée de vente native ne peut
 * pas se retrouver faussement en vente (contrat « jamais retiré, jamais
 * inventé » du catalogue).
 */
const NO_COMMERCE: CommerceInfo = { sellable: false, stock: null };

/**
 * Résout le statut d'achat NATIF d'un livre (`COMMERCE_NATIVE=1` — données
 * Payload `sellable`/`stock`, plus aucun appel Store API) — remplace
 * `resolvePurchase` pour ce chemin, avec un ORDRE DE RÈGLES délibérément
 * différent (décision client, plan §4 étape 11) :
 *
 *  1. Parution FUTURE → « à paraître ». PRIME sur tout le reste, y compris un
 *     stock positif : un livre pas encore sorti ne se vend pas, même si sa
 *     fiche est déjà cochée vendable avec du stock en préparation.
 *  2. Sinon vendable ET (stock non suivi OU stock > 0) → disponible, panier
 *     natif. `stock === null` = non suivi = disponible (jamais un plancher
 *     qui bloquerait la vente d'un article dont le stock n'est pas géré) ;
 *     `stock === 0` = épuisé, ne passe PAS cette porte (plancher strict).
 *  3. Sinon lien(s) externe(s) existant(s) (Paris Librairies / La Librairie)
 *     → « en librairie », lien externe inchangé.
 *  4. Sinon indisponible — jamais retiré du catalogue (contrat).
 *
 * `internalPermalink` est fourni par l'appelant (route `/catalogue/<edition>/
 * <slug>` ou `/boutique/<slug>`, plan §4 étape 11) : ce module reste pur, il
 * ne connaît pas les routes de l'app.
 */
export function resolveNativePurchase(
  book: Pick<Book, "publishedAt" | "buy">,
  commerce: CommerceInfo,
  internalPermalink: string,
): { status: PurchaseStatus; permalink: string | null; purchaseMode: PurchaseMode } {
  if (isUpcoming(book.publishedAt)) {
    return { status: "upcoming", permalink: null, purchaseMode: "legacy-link" };
  }
  if (commerce.sellable && (commerce.stock == null || commerce.stock > 0)) {
    return { status: "available", permalink: internalPermalink, purchaseMode: "cart" };
  }
  const external = book.buy.parislibrairies || book.buy.lalibrairie;
  if (external) {
    return { status: "external", permalink: external, purchaseMode: "legacy-link" };
  }
  return { status: "unavailable", permalink: null, purchaseMode: "legacy-link" };
}

/**
 * Catalogue unifié en commerce natif : les deux fonds (statut résolu via
 * Payload, jamais la Store API) + les articles boutique-seuls
 * (`origin: "boutique"`, `edition: null`, fournis séparément par l'appelant —
 * `catalogue-pg.ts:listBoutiqueOnlyBooks`, ils ne vivent pas dans
 * `rawByEdition` puisqu'ils n'ont pas de maison). Symétrique de
 * `buildCatalogue`, sans dépendre de `WcProduct`.
 */
export function buildNativeCatalogue(
  rawByEdition: Partial<Record<EditionSlug, RawBook[]>>,
  boutiqueOnly: RawBook[] = [],
): Book[] {
  const siteBooks = (Object.keys(rawByEdition) as EditionSlug[]).flatMap((edition) =>
    (rawByEdition[edition] ?? []).map((raw) => {
      const book = toBook(edition, raw);
      const permalink = `/catalogue/${edition}/${raw.slug}`;
      return { ...book, ...resolveNativePurchase(book, raw.commerce ?? NO_COMMERCE, permalink) };
    }),
  );

  const extras = boutiqueOnly.map((raw) => {
    const book = toBook(null, raw, "boutique");
    const permalink = `/boutique/${raw.slug}`;
    return { ...book, ...resolveNativePurchase(book, raw.commerce ?? NO_COMMERCE, permalink) };
  });

  return [...siteBooks, ...extras];
}

/**
 * Point de bascule pur (E4/E11 du plan) : à `nativeCommerce=false`, délègue
 * tel quel à `buildCatalogue` — STRICTEMENT le même tableau qu'avant ce
 * module (iso-comportement, testé). À `true`, bascule sur
 * `buildNativeCatalogue` et ignore `products` (plus aucun appel Store API en
 * amont non plus : c'est l'appelant, `catalogue.ts`, qui décide de ne même
 * pas aller chercher `products`/`boutiqueOnly` selon le flag).
 */
export function buildCatalogueForFlag(
  nativeCommerce: boolean,
  rawByEdition: Partial<Record<EditionSlug, RawBook[]>>,
  products: WcProduct[],
  boutiqueOnly: RawBook[] = [],
): Book[] {
  return nativeCommerce
    ? buildNativeCatalogue(rawByEdition, boutiqueOnly)
    : buildCatalogue(rawByEdition, products);
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
  raw: RawBook,
  products: WcProduct[],
): BookDetail {
  const book = toBook(edition, raw);
  const productSlug = slugFromBoutiqueLink(book.buy.boutique);
  const product = productSlug ? products.find((p) => p.slug === productSlug) : undefined;
  const resolved = resolvePurchase(book, product);

  return {
    ...book,
    ...resolved,
    presentation: sanitizeCms(raw.presentationHtml ?? ""),
    furtherReading: raw.furtherReadingHtml ? sanitizeCms(raw.furtherReadingHtml) : null,
    tocUrl: raw.tocUrl,
    excerptUrl: raw.excerptUrl,
  };
}

/** Fiche complète d'un livre en commerce natif — symétrique de `buildBookDetail`, sans `WcProduct`. */
export function buildNativeBookDetail(
  edition: EditionSlug | null,
  raw: RawBook,
  permalink: string,
  origin: Book["origin"] = "catalogue",
): BookDetail {
  const book = toBook(edition, raw, origin);
  const resolved = resolveNativePurchase(book, raw.commerce ?? NO_COMMERCE, permalink);

  return {
    ...book,
    ...resolved,
    presentation: sanitizeCms(raw.presentationHtml ?? ""),
    furtherReading: raw.furtherReadingHtml ? sanitizeCms(raw.furtherReadingHtml) : null,
    tocUrl: raw.tocUrl,
    excerptUrl: raw.excerptUrl,
  };
}
