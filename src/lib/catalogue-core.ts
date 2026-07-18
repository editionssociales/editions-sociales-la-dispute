import { sanitizeCms } from "./cms-html";
import { assessSellability } from "./sellability";
import { frenchTypo } from "./typo-fr";
import { type CommerceInfo, type RawBook } from "./catalogue-source";
import type {
  Book,
  BookDetail,
  BookFilters,
  EditionSlug,
  Facet,
  PurchaseMode,
  PurchaseStatus,
  Term,
} from "./types";

/**
 * Cœur du catalogue unifié — **pur**, sans I/O ni rendu, et sans dialecte de
 * source (l'enveloppe Payload vit dans `catalogue-pg-map.ts`).
 *
 * Assemble les fiches livre des deux fonds et les articles boutique-seuls,
 * résout le statut d'achat (verdict `sellability.ts`), puis expose filtre,
 * tri et facettes. Un livre n'est jamais retiré faute d'être en vente : il
 * est « à paraître » ou « indisponible en ligne ». Toute cette logique se
 * teste avec des fixtures, à travers le port `CatalogueSource`.
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

/* --------------------------- résolution d'achat (Payload) --------------------------- */

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
 * Résout le statut d'achat d'un livre (données Payload `sellable`/`stock`) —
 * ORDRE DE RÈGLES tranché par le client (plan §4 étape 11) :
 *
 *  1. Verdict `upcoming` (« à paraître ») → PRIME sur tout le reste — la
 *     règle stock/parution elle-même (non suivi, épuisé, priorité de la
 *     parution) vit dans `sellability.ts:assessSellability`, ce module ne
 *     fait plus que la traduire en statut d'achat.
 *  2. Verdict vendable → disponible, panier natif.
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
  const verdict = assessSellability({
    sellable: commerce.sellable,
    stock: commerce.stock,
    publishedAt: book.publishedAt,
  });
  if (!verdict.ok && verdict.reason === "upcoming") {
    return { status: "upcoming", permalink: null, purchaseMode: "legacy-link" };
  }
  if (verdict.ok) {
    return { status: "available", permalink: internalPermalink, purchaseMode: "cart" };
  }
  const external = book.buy.parislibrairies || book.buy.lalibrairie;
  if (external) {
    return { status: "external", permalink: external, purchaseMode: "legacy-link" };
  }
  return { status: "unavailable", permalink: null, purchaseMode: "legacy-link" };
}

/**
 * Catalogue unifié : les deux fonds (statut résolu via Payload) + les
 * articles boutique-seuls (`origin: "boutique"`, `edition: null`, fournis
 * séparément par l'appelant — `catalogue-pg.ts:listBoutiqueOnlyBooks`, ils ne
 * vivent pas dans `rawByEdition` puisqu'ils n'ont pas de maison).
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
