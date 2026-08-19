/**
 * Cœur pur de la table de redirections `/produit/<slug>` — reprise de
 * l'appariement produit ⟷ fiche de feu `migrate-products-core.ts` (supprimé
 * par la coupure OVH, `aef3282`), adapté au monde d'après : la boutique
 * WooCommerce n'existe plus, son inventaire de slugs produit est GELÉ
 * (`scripts/produits-boutique-legacy.json`) et seule la base Payload prod
 * reste vivante — les fiches (slug, édition) peuvent encore changer, jamais
 * l'espace d'URLs legacy.
 *
 * Aucune I/O ici (pas de Local API, pas de lecture de fichier) : c'est la
 * surface couverte par `build-product-redirects-core.test.ts`, même découpage
 * que `catalogue-core.ts` (`src/lib/CLAUDE.md`). L'orchestrateur est
 * `scripts/build-product-redirects.ts`.
 */
import type { EditionSlug } from "../src/lib/types.ts";

/** Fiche catalogue minimale nécessaire à l'appariement (extraite du doc Payload par l'appelant). */
export interface BookRef {
  id: number;
  slug: string;
  edition: EditionSlug | null;
  origin: "catalogue" | "boutique";
  /** `buy.boutiqueUrl` tel quel — `null` si la fiche n'a jamais eu de lien boutique. */
  boutiqueUrl: string | null;
}

/**
 * Slug produit extrait d'un lien `buy.boutiqueUrl` — même extraction que feu
 * `catalogue-source.ts` (supprimée du front avec la coupure OVH, le script de
 * redirections en est le dernier consommateur).
 */
export function slugFromBoutiqueLink(link: string | null): string | null {
  if (!link) return null;
  let decoded = link;
  try {
    decoded = decodeURIComponent(link);
  } catch {
    // URL déjà décodée ou séquence invalide : on retente sur le brut.
  }
  const m = /\/produit\/([^/?#]+)\/?/.exec(decoded);
  return m?.[1] ?? null;
}

export type ArbitrageCategory = "lien-casse" | "double-reclamation";

/**
 * Une ligne de la table de décisions humaines. `resolution` est le seul champ
 * qui produise une entrée : tant qu'il vaut `null`, l'entrée reste un TODO et
 * la fiche concernée n'apparaît pas dans la table — défaut conservateur
 * (« ne rien casser »), hérité de la migration.
 */
export interface ArbitrageEntry {
  category: ArbitrageCategory;
  /** Slug de la fiche Payload concernée — clé d'appariement à la table (stable, indépendant du lien boutique courant). */
  bookSlug: string;
  /** Segment produit tel qu'extrait de `buy.boutiqueUrl` au moment de l'analyse — devient un alias de redirection une fois résolu. */
  brokenSlug: string;
  /** Constat qui motive l'entrée (dérive de slug, coquille, double réclamation…). */
  note: string;
  /** Piste d'investigation — jamais appliquée automatiquement. */
  candidate: string | null;
  /** Résolution retenue : slug produit (inventaire gelé) à apparier à cette fiche. `null` = TODO. */
  resolution: string | null;
}

/*
 * Décisions client du 12/07/2026, verbatim de feu `migrate-products-core.ts`
 * (vérifiées à l'époque contre la Store API live — infalsifiables depuis, la
 * boutique a disparu) : liens `-prevente` périmés et coquilles → le candidat
 * vérifié ; doublons → *drop oldest* ; le produit « Pensée et langage »
 * disputé entre les éditions 2019 et 2025 revient à la plus récente
 * (`pensee-et-langage-2`).
 */
export const ARBITRAGES: ArbitrageEntry[] = [
  {
    category: "lien-casse",
    bookSlug: "decouvrir-gorz",
    brokenSlug: "celine-marty-decouvrir-gorz-prevente",
    note: "Dérive « -prevente » : le produit a quitté la précommande, son slug final n'a jamais été reporté sur la fiche.",
    candidate: "celine-marty-decouvrir-gorz",
    resolution: "celine-marty-decouvrir-gorz",
  },
  {
    category: "lien-casse",
    bookSlug: "decouvrir-la-revolution-francaise",
    brokenSlug: "jean-marc-schiappa-decouvrir-la-revolution-francaise-prevente",
    note: "Même dérive « -prevente ».",
    candidate: "jean-marc-schiappa-decouvrir-la-revolution-francaise",
    resolution: "jean-marc-schiappa-decouvrir-la-revolution-francaise",
  },
  {
    category: "lien-casse",
    bookSlug: "linstitution-du-handicap",
    brokenSlug: "romulad-bodin-linstitution-du-handicap",
    note: "Coquille sur le lien (« romulad » pour « romuald ») — transposition de deux lettres, produit sans ambiguïté.",
    candidate: "romuald-bodin-linstitution-du-handicap",
    resolution: "romuald-bodin-linstitution-du-handicap",
  },
  {
    category: "lien-casse",
    bookSlug: "pensee-et-langage-2",
    brokenSlug: "lev-vygotski-pensee-et-langage-prevente",
    note:
      "Édition 2025, dérive « -prevente ». Produit disputé avec l'édition 2019 (« pensee-et-langage », lien cassé " +
      "lui aussi) — décision client « drop oldest » : il revient à l'édition la plus récente.",
    candidate: "lev-vygotski-pensee-et-langage",
    resolution: "lev-vygotski-pensee-et-langage",
  },
  {
    category: "double-reclamation",
    bookSlug: "decouvrir-victor-hugo",
    brokenSlug: "stephane-haber-decouvrir-victor-hugo",
    note:
      "Produit réclamé par CETTE fiche ET par « decouvrir-le-programme-du-cnr » (entrée suivante) ; son nom " +
      "correspond exactement à cette fiche-ci.",
    candidate: "stephane-haber-decouvrir-victor-hugo",
    resolution: "stephane-haber-decouvrir-victor-hugo",
  },
  {
    category: "double-reclamation",
    bookSlug: "decouvrir-le-programme-du-cnr",
    brokenSlug: "stephane-haber-decouvrir-victor-hugo",
    note:
      "Cette fiche pointait par erreur (copier-coller ACF côté WordPress) vers le produit de Victor Hugo ; son " +
      "propre produit existait, non réclamé par personne.",
    candidate: "laurent-douzou-decouvrir-le-programme-du-cnr",
    resolution: "laurent-douzou-decouvrir-le-programme-du-cnr",
  },
];

/** Une clé d'inventaire réclamée par une fiche — matière première des entrées de la table. */
export interface MatchedClaim {
  productSlug: string;
  book: BookRef;
}

export interface MatchResult {
  /** Réclamations retenues (une fiche, une clé d'inventaire) — deviennent les entrées `edition` non nulle. */
  matched: MatchedClaim[];
  /** Entrées d'arbitrage encore sans résolution — rapportées, aucune entrée produite. */
  pendingArbitrage: ArbitrageEntry[];
  /** Entrées arbitrées dont la résolution ne correspond à aucun slug de l'inventaire gelé. */
  invalidResolutions: ArbitrageEntry[];
  /** Une même clé réclamée par plusieurs fiches sans arbitrage — anomalie, aucune entrée (défaut conservateur). */
  unexpectedDuplicates: { productSlug: string; bookSlugs: string[] }[];
  /** Liens `buy.boutiqueUrl` dont le slug n'appartient pas à l'inventaire gelé — la boutique n'a jamais servi cette URL, rapport seul. */
  linksOutsideInventory: { bookSlug: string; productSlug: string }[];
  /** Clés jamais réclamées mais portées par une fiche `origin: "boutique"` homonyme — deviennent les entrées `edition: null`. */
  orphans: MatchedClaim[];
  /** Fiches `origin: "boutique"` hors inventaire (créées après la coupure) — aucune URL legacy à rediriger, rapport seul. */
  boutiqueOutsideInventory: string[];
}

/** `decodeURIComponent` tolérant — rend le brut si la séquence est invalide (même repli que `slugFromBoutiqueLink`). */
function safeDecode(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

/**
 * Index inventaire par forme DÉCODÉE → clé d'origine : WordPress stockait les
 * slugs non-ASCII percent-encodés (ex. `apprenti%c2%b7e%c2%b7s`, point médian)
 * alors que `slugFromBoutiqueLink` décode — sans cette tolérance, la fiche ne
 * retrouve pas sa clé. L'entrée émise garde TOUJOURS la clé d'inventaire
 * verbatim (c'est elle que `next.config.ts` sert, vérifié live le 19/08).
 */
function indexInventory(inventory: Iterable<string>): Map<string, string> {
  const byDecoded = new Map<string, string>();
  for (const key of inventory) {
    const decoded = safeDecode(key);
    if (!byDecoded.has(decoded)) byDecoded.set(decoded, key);
  }
  return byDecoded;
}

/**
 * Apparie chaque fiche à sa clé d'inventaire par slug (`slugFromBoutiqueLink`),
 * en laissant la table d'arbitrage trancher pour les fiches qu'elle couvre —
 * ces fiches ne passent JAMAIS par l'appariement « normal ». Mêmes règles que
 * feu `matchProducts` (migration), l'inventaire gelé remplaçant la liste live
 * de la Store API : une clé hors inventaire ne produit jamais d'entrée, un
 * conflit non arbitré non plus.
 */
export function matchProducts(
  books: BookRef[],
  inventory: Iterable<string>,
  arbitrages: ArbitrageEntry[],
): MatchResult {
  const byDecoded = indexInventory(inventory);
  const resolveKey = (slug: string): string | null => byDecoded.get(safeDecode(slug)) ?? null;
  const arbitrageByBookSlug = new Map(arbitrages.map((a) => [a.bookSlug, a]));

  const pendingArbitrage: ArbitrageEntry[] = [];
  const invalidResolutions: ArbitrageEntry[] = [];
  const linksOutsideInventory: MatchResult["linksOutsideInventory"] = [];
  const candidates: MatchedClaim[] = [];

  for (const book of books) {
    const arbitrage = arbitrageByBookSlug.get(book.slug);
    if (arbitrage) {
      if (arbitrage.resolution == null) {
        pendingArbitrage.push(arbitrage);
      } else {
        const key = resolveKey(arbitrage.resolution);
        if (key != null) candidates.push({ productSlug: key, book });
        else invalidResolutions.push(arbitrage);
      }
      continue;
    }

    const raw = slugFromBoutiqueLink(book.boutiqueUrl);
    if (!raw) continue;
    const key = resolveKey(raw);
    if (key != null) candidates.push({ productSlug: key, book });
    else linksOutsideInventory.push({ bookSlug: book.slug, productSlug: raw });
  }

  // Détection de conflit a posteriori, tous chemins confondus (appariement
  // direct + arbitrages résolus) : deux fiches sur la même clé doivent
  // échouer silencieusement — jamais une redirection au hasard.
  const bySlug = new Map<string, MatchedClaim[]>();
  for (const c of candidates) {
    const arr = bySlug.get(c.productSlug) ?? [];
    arr.push(c);
    bySlug.set(c.productSlug, arr);
  }
  const matched: MatchedClaim[] = [];
  const unexpectedDuplicates: MatchResult["unexpectedDuplicates"] = [];
  for (const [slug, arr] of bySlug) {
    if (arr.length === 1) matched.push(arr[0]);
    else unexpectedDuplicates.push({ productSlug: slug, bookSlugs: arr.map((c) => c.book.slug) });
  }

  // Clés réservées (jamais orphelines) : réclamées, disputées, ou visées par
  // une entrée d'arbitrage — même réserve conservatrice que la migration.
  const reserved = new Set<string>(matched.map((m) => m.productSlug));
  for (const d of unexpectedDuplicates) reserved.add(d.productSlug);
  for (const a of arbitrages) {
    const broken = resolveKey(a.brokenSlug);
    if (broken != null) reserved.add(broken);
    const candidate = a.candidate == null ? null : resolveKey(a.candidate);
    if (candidate != null) reserved.add(candidate);
  }

  // Orphelins : les anciens produits sans fiche catalogue (goodies…) n'ont
  // d'entrée que si leur fiche `origin: "boutique"` homonyme existe en base —
  // une clé sans fiche du tout disparaît de la table (repli `/catalogue` de
  // `next.config.ts`, préférable à une redirection vers un 404).
  const orphans: MatchedClaim[] = [];
  const boutiqueOutsideInventory: string[] = [];
  for (const book of books) {
    if (book.origin !== "boutique") continue;
    const key = resolveKey(book.slug);
    if (key == null) boutiqueOutsideInventory.push(book.slug);
    else if (!reserved.has(key)) orphans.push({ productSlug: key, book });
  }

  return {
    matched,
    pendingArbitrage,
    invalidResolutions,
    unexpectedDuplicates,
    linksOutsideInventory,
    orphans,
    boutiqueOutsideInventory,
  };
}

/**
 * Destination d'une redirection `/produit/<slug>` : une fiche catalogue
 * (`edition` non nulle) ou une fiche `origin: "boutique"` (`edition: null`,
 * destination `/boutique/<slug>`) — même disjonction que `next.config.ts`.
 */
export interface ProductRedirectTarget {
  edition: EditionSlug | null;
  slug: string;
}

/** Table `/produit/<slug>` → fiche, clé = slug produit de l'inventaire gelé (+ alias historiques, cf. `buildProductRedirectTable`). */
export type ProductRedirectTable = Record<string, ProductRedirectTarget>;

/**
 * Construit la table à partir du résultat de `matchProducts` :
 *
 * - une clé réclamée (`matched`) → la fiche qui l'a réclamée (édition, slug
 *   COURANTS — c'est tout l'objet de la régénération) ;
 * - un lien cassé arbitré qui a abouti : le slug ORIGINAL du lien mort
 *   (`brokenSlug`) reçoit la même destination, en plus de la clé courante —
 *   jamais écrasé si le slug cassé coïncide avec une vraie clé déjà posée ;
 * - une clé orpheline portée par une fiche `origin: "boutique"` →
 *   `edition: null` (destination `/boutique/<slug>`).
 *
 * `pendingArbitrage`/`invalidResolutions`/`unexpectedDuplicates`/
 * `linksOutsideInventory`/`boutiqueOutsideInventory` ne produisent aucune
 * entrée — l'orchestrateur les rapporte séparément.
 */
export function buildProductRedirectTable(
  match: MatchResult,
  arbitrages: ArbitrageEntry[],
): ProductRedirectTable {
  const table: ProductRedirectTable = {};

  for (const { productSlug, book } of match.matched) {
    table[productSlug] = { edition: book.edition, slug: book.slug };
  }

  const matchedByBookSlug = new Map(match.matched.map((m) => [m.book.slug, m]));
  for (const a of arbitrages) {
    if (a.resolution == null) continue;
    const resolved = matchedByBookSlug.get(a.bookSlug);
    if (!resolved) continue; // TODO encore ouvert ou résolution invalide — rien à ajouter
    if (a.brokenSlug in table) continue; // ne jamais écraser une entrée déjà posée par une vraie clé homonyme
    table[a.brokenSlug] = { edition: resolved.book.edition, slug: resolved.book.slug };
  }

  for (const { productSlug, book } of match.orphans) {
    table[productSlug] = { edition: null, slug: book.slug };
  }

  return table;
}

/** Écart entre deux générations de la table — matière du rapport « disparus / ajoutés / recibles » demandé en revue de PR. */
export interface TableDiff {
  /** Clés de la table précédente absentes de la nouvelle (fiche disparue, lien retiré, conflit) — leurs URLs retombent sur `/catalogue`. */
  removed: { key: string; before: ProductRedirectTarget }[];
  /** Clés nouvelles (fiche boutique recréée, arbitrage débloqué…). */
  added: { key: string; after: ProductRedirectTarget }[];
  /** Clés conservées dont la destination change (slug ou édition de fiche modifiés depuis la génération précédente). */
  retargeted: { key: string; before: ProductRedirectTarget; after: ProductRedirectTarget }[];
}

export function diffTables(previous: ProductRedirectTable, next: ProductRedirectTable): TableDiff {
  const removed: TableDiff["removed"] = [];
  const added: TableDiff["added"] = [];
  const retargeted: TableDiff["retargeted"] = [];

  for (const [key, before] of Object.entries(previous)) {
    const after = next[key];
    if (!after) removed.push({ key, before });
    else if (after.edition !== before.edition || after.slug !== before.slug) retargeted.push({ key, before, after });
  }
  for (const [key, after] of Object.entries(next)) {
    if (!(key in previous)) added.push({ key, after });
  }

  return { removed, added, retargeted };
}
