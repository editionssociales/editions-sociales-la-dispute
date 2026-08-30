import { sanitizeCms } from "./cms-html";
import { isoDayParis, monthsAgoParisMonthStartUtc } from "./format";
import { matchesSearchQuery } from "./search-text";
import { assessSellability, isUpcoming } from "./sellability";
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
    libelles: raw.libelles,
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
 * Résout le statut d'achat d'un livre (données Payload `sellable`/`stock`/
 * `preorder`) — ORDRE DE RÈGLES tranché par le client (plan §4 étape 11,
 * complété 2026-08-20 pour la précommande) :
 *
 *  1. Verdict `upcoming` (« à paraître », SANS précommande ouverte) → PRIME
 *     sur tout le reste — la règle stock/parution/précommande elle-même vit
 *     dans `sellability.ts:assessSellability`, ce module ne fait plus que la
 *     traduire en statut d'achat.
 *  2. Verdict vendable ET encore à paraître (précommande ouverte,
 *     `commerce.preorder`) → `preorder`, panier natif comme `available` —
 *     `isUpcoming` est le même helper pur qu'`assessSellability` a déjà
 *     consulté pour ce verdict, jamais une seconde règle de refus.
 *  3. Verdict vendable (parution passée) → disponible, panier natif.
 *  4. Sinon lien(s) externe(s) existant(s) (Paris Librairies / La Librairie)
 *     → « en librairie », lien externe inchangé.
 *  5. Sinon indisponible — jamais retiré du catalogue (contrat).
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
    preorderEnabled: commerce.preorder,
  });
  if (!verdict.ok && verdict.reason === "upcoming") {
    return { status: "upcoming", permalink: null, purchaseMode: "legacy-link" };
  }
  if (verdict.ok) {
    const status: PurchaseStatus = isUpcoming(book.publishedAt) ? "preorder" : "available";
    return { status, permalink: internalPermalink, purchaseMode: "cart" };
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

const FILTER_KEYS = ["edition", "libelle", "author", "q", "upcoming"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function matches(book: Book, filters: BookFilters, key: FilterKey): boolean {
  switch (key) {
    case "edition":
      return !filters.edition || book.edition === filters.edition;
    case "libelle":
      return !filters.libelle || book.libelles.some((l) => l.slug === filters.libelle);
    case "author":
      return !filters.author || book.authors.some((a) => a.slug === filters.author);
    case "q": {
      if (!filters.q) return true;
      // Règle d'appariement UNIQUE (`search-text`) : pliage accents/casse/
      // espaces typographiques + jetons en ET — PARTAGÉE avec la complétion
      // de la barre de recherche (`search-suggest-core`), sinon le dropdown
      // trouverait « État » quand la grille afficherait 0 résultat. Les
      // libellés comptent parmi les champs : chercher un thème au clavier
      // montre ses livres, comme le fait la suggestion de libellé.
      return matchesSearchQuery(
        [book.title, ...book.authors.map((a) => a.name), ...book.libelles.map((l) => l.name)],
        filters.q,
      );
    }
    case "upcoming":
      // Le statut est résolu par `resolvePurchase` (boutique + dates) avant
      // tout filtrage. `preorder` reste « à paraître » du point de vue de
      // cette vue de découverte (parution future) — seul l'achat change,
      // pas la date : un livre en précommande ne doit pas disparaître de la
      // vue « à paraître » sous prétexte qu'il est déjà achetable.
      return !filters.upcoming || book.status === "upcoming" || book.status === "preorder";
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

/**
 * Fenêtre « nouveautés » de l'accueil : mois civil Paris courant + les 2
 * précédents (retour client 2026-08-29 — en septembre : septembre, août,
 * juillet). Un livre « à paraître » (même publié le mois courant) n'est
 * jamais une nouveauté : il reste dans sa section propre.
 */
export function isRecentRelease(publishedAt: string | null, now: Date): boolean {
  if (publishedAt == null) return false;
  if (isUpcoming(publishedAt, now)) return false;
  const windowStart = isoDayParis(monthsAgoParisMonthStartUtc(now, 2));
  return windowStart != null && publishedAt >= windowStart;
}

/**
 * Plancher de la vitrine « nouveautés » — jamais de vitrine vide un mois
 * creux (arbitrage produit, révisable) : si la fenêtre des 3 mois ne fournit
 * pas au moins `RECENT_MIN` titres, on complète avec les parutions les plus
 * récentes HORS fenêtre, toujours PARUES (jamais un à-paraître réintroduit),
 * jusqu'à `min(limit, RECENT_MIN)`.
 */
const RECENT_MIN = 6;

/**
 * Nouveautés de l'accueil : `books` doit déjà être trié « recent »
 * (`queryBooks(..., { sort: "recent" })`) — l'ordre est préservé par le
 * filtre, le plancher pioche donc déjà dans les parutions les plus récentes.
 */
export function recentReleases(books: Book[], limit: number, now: Date): Book[] {
  const inWindow = books.filter((b) => isRecentRelease(b.publishedAt, now));
  const floor = Math.min(limit, RECENT_MIN);
  if (inWindow.length >= floor) return inWindow.slice(0, limit);

  const seen = new Set(inWindow.map((b) => b.id));
  const fallback = books.filter(
    (b) => !seen.has(b.id) && b.publishedAt != null && !isUpcoming(b.publishedAt, now),
  );
  return [...inWindow, ...fallback.slice(0, floor - inWindow.length)].slice(0, limit);
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
 * actives — sélectionner un libellé ne laisse dans la liste des auteurs
 * que ceux qui y publient, et inversement.
 */
export function computeFacets(
  all: Book[],
  filters: BookFilters = {},
): { libelles: Facet[]; authors: Facet[]; total: number } {
  const forLibelles = filterBooks(all, filters, ["libelle"]);
  const forAuthors = filterBooks(all, filters, ["author"]);
  return {
    // Libellés en ordre alphabétique (tally) — arbitrage client 22/07 : la
    // mosaïque assume un rendu « désordonné » (tailles pondérées SANS tri par
    // taille, trous acceptés) ; ne pas réintroduire de .sort() par count ici.
    libelles: tally(forLibelles, (b) => b.libelles),
    authors: tally(forAuthors, (b) => b.authors),
    // Total de la cellule « Tous les livres » du menu libellés : les mêmes livres
    // que la tally des libellés (toutes les dimensions sauf libelle),
    // pas `allBooks.length` qui serait déjà restreint si un libellé est actif.
    total: forLibelles.length,
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
    press: raw.press ?? [],
    videoUrl: raw.videoUrl ?? null,
    tocHtml: raw.tocHtml ? sanitizeCms(raw.tocHtml) : null,
  };
}
