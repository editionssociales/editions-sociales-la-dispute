/**
 * Cœur pur de la migration des produits WooCommerce (`scripts/migrate-products.ts`,
 * plan/04-commerce.md étape 4) : appariement produit ⟷ fiche, application des
 * arbitrages humains, mapping des données `commerce`/`origin: boutique`.
 *
 * Aucune I/O ici (pas de fetch, pas de Local API, pas de conversion Lexical —
 * ça reste dans l'orchestrateur) : c'est la surface couverte par
 * `migrate-products-core.test.ts`, même découpage que
 * `catalogue-core.ts`/`catalogue-http.ts` (`src/lib/CLAUDE.md`).
 */
import { priceOf, slugFromBoutiqueLink, type WcProduct } from "../src/lib/catalogue-source.ts";
import type { EditionSlug } from "../src/lib/types.ts";
import { decodeEntities } from "./migrate-catalogue/utils.ts";

/** Fiche catalogue minimale nécessaire à l'appariement (extraite du doc Payload par l'appelant). */
export interface BookRef {
  id: number;
  slug: string;
  edition: EditionSlug | null;
  /** `buy.boutiqueUrl` tel quel — `null` si la fiche n'a jamais eu de lien boutique. */
  boutiqueUrl: string | null;
  published: boolean;
}

export type ArbitrageCategory = "lien-casse" | "double-reclamation";

/**
 * Une ligne de la table de décisions humaines (`ARBITRAGES`, en tête de
 * `migrate-products.ts`). `resolution` est le seul champ qui déclenche une
 * écriture : tant qu'il vaut `null`, l'entrée reste un TODO et le script ne
 * touche ni la fiche ni le produit concerné — défaut conservateur (« ne rien
 * casser »), la décision revient au client (plan §Arbitrages humains).
 */
export interface ArbitrageEntry {
  category: ArbitrageCategory;
  /** Slug de la fiche Payload concernée — clé d'appariement à la table (stable, indépendant du lien boutique courant). */
  bookSlug: string;
  /** Segment produit tel qu'extrait de `buy.boutiqueUrl` au moment de l'analyse (repère pour le rapport humain). */
  brokenSlug: string;
  /** Constat qui motive l'entrée (dérive de slug, coquille, double réclamation…). */
  note: string;
  /** Piste d'investigation — jamais appliquée automatiquement, affichée pour accélérer la décision. */
  candidate: string | null;
  /** Résolution retenue : slug produit à apparier à cette fiche. `null` = TODO. */
  resolution: string | null;
}

/* ─────────────────────────── Table de décisions (arbitrages humains) ───────────────────────────
 *
 * Constatée sur la base locale le 12/07 (213 liens `buy.boutiqueUrl`, 223
 * produits Store API) : 204 valides pour 203 produits distincts, 9 liens
 * cassés, 1 produit doublement réclamé, 20 orphelins — chiffres alignés sur
 * `plan/04-commerce.md` §Migration produits. `candidate` est une PISTE
 * d'investigation (grep + comparaison de noms) : jamais appliquée seule —
 * seul un `resolution` explicite (posé par un humain, ici ou en aval) écrit
 * quoi que ce soit. Défaut conservateur : tout TODO reste un TODO.
 *
 * Arbitrages du client (12/07) appliqués ci-dessous, vérifiés contre la base
 * locale (ISBN/dates `payload.books`) et la Store API live (`WC_STORE_URL`,
 * 223 produits) :
 *   - lien `-prevente` périmé ou coquille de lien avec un candidat réel et
 *     univoque (titre/auteur vérifiés) → `resolution` = le candidat.
 *   - doublon (même produit visé par deux éditions d'un même titre) → *drop
 *     oldest* : la fiche à la parution la plus récente reçoit le produit, la
 *     plus ancienne reste sans commerce natif. Trois cas relèvent de ce
 *     motif ; deux sont déjà tranchés silencieusement par un lien direct
 *     *valide* sur la fiche récente (pas besoin d'entrée ici, cf. note sous
 *     le tableau) et n'apparaissent donc plus dans `ARBITRAGES` :
 *     `larrangement-des-sexes` (2002) perd face à `larrangement-des-sexes-
 *     nouvelle-edition` (2026, lien direct → `erving-goffman-larrangement-
 *     des-sexe`) ; `le-capital-livre-1` (2016) perd face à `le-capital-
 *     livre-1-2` (2022, lien direct → `karl-marx-le-capital-livre-1-2`).
 *     Le troisième (`pensee-et-langage` 2019 vs `pensee-et-langage-2` 2025)
 *     était réellement disputé (les deux liens étaient cassés) : résolu par
 *     la date ci-dessous.
 *   - fiche sans aucun produit correspondant (recherche exacte + par
 *     similarité sur titre/auteur, infructueuse sur les 223 produits) →
 *     rien n'est écrit, rien n'est inventé ; ces fiches n'ont plus besoin
 *     d'entrée ici non plus (cf. note sous le tableau).
 *
 * Exportée (plutôt que privée à `migrate-products.ts`) : c'est la même table
 * de décisions humaines que consomme `scripts/build-product-redirects.ts`
 * (E4/P7 du plan, table de redirections `/produit/<slug>`) — une seule
 * source de vérité pour l'appariement produit⟷fiche, jamais deux tables qui
 * pourraient diverger.
 */
export const ARBITRAGES: ArbitrageEntry[] = [
  {
    category: "lien-casse",
    bookSlug: "decouvrir-gorz",
    brokenSlug: "celine-marty-decouvrir-gorz-prevente",
    note: "Dérive « -prevente » : le produit a quitté la précommande, son slug final n'a jamais été reporté sur la fiche.",
    candidate: "celine-marty-decouvrir-gorz",
    // Décision client (12/07) : candidat vérifié (Store API live, id 5200,
    // « Céline Marty, Découvrir Gorz ») — titre/auteur correspondent exactement.
    resolution: "celine-marty-decouvrir-gorz",
  },
  {
    category: "lien-casse",
    bookSlug: "decouvrir-la-revolution-francaise",
    brokenSlug: "jean-marc-schiappa-decouvrir-la-revolution-francaise-prevente",
    note: "Même dérive « -prevente ». Produit actuellement `outofstock` côté boutique.",
    candidate: "jean-marc-schiappa-decouvrir-la-revolution-francaise",
    // Décision client (12/07) : candidat vérifié (Store API live, id 5202,
    // « Jean-Marc Schiappa, Découvrir la Révolution française »), `is_in_stock:
    // false` confirmé — sans importance, le stock est désormais piloté par le
    // routeur (`commerce.stock` n'est jamais écrit par ce script).
    resolution: "jean-marc-schiappa-decouvrir-la-revolution-francaise",
  },
  {
    category: "lien-casse",
    bookSlug: "linstitution-du-handicap",
    brokenSlug: "romulad-bodin-linstitution-du-handicap",
    note: "Coquille sur le lien (« romulad » pour « romuald ») — transposition de deux lettres, nom du produit sans ambiguïté.",
    candidate: "romuald-bodin-linstitution-du-handicap",
    // Décision client (12/07) : candidat vérifié (Store API live, id 1293,
    // « Romuald Bodin, L'Institution du handicap ») — correspond exactement
    // au titre de la fiche.
    resolution: "romuald-bodin-linstitution-du-handicap",
  },
  {
    category: "lien-casse",
    bookSlug: "pensee-et-langage-2",
    brokenSlug: "lev-vygotski-pensee-et-langage-prevente",
    note:
      "Édition 2025 (ISBN 9782843033490), dérive « -prevente ». Même produit candidat que « pensee-et-langage » " +
      "(édition 2019, ISBN 9782843033018, lien cassé lui aussi — « lev-s-vygotski-pensee-et-langage ») : un seul " +
      "produit boutique existant pour « Pensée et langage » (Store API live, id 5204, « Lev Vygotski, Pensée et " +
      "langage »), aucun des deux liens ne le nommait exactement.",
    candidate: "lev-vygotski-pensee-et-langage",
    // Décision client (12/07) — règle « doublon → drop oldest » : le produit
    // disputé revient à l'édition la plus récente (2025 > 2019). La fiche
    // 2019 (`pensee-et-langage`) reste donc sans commerce natif — aucune
    // entrée nécessaire pour elle (cf. note au-dessus du tableau).
    resolution: "lev-vygotski-pensee-et-langage",
  },
  // --- Double réclamation : un même produit, deux fiches (plan §Migration produits) ---
  {
    category: "double-reclamation",
    bookSlug: "decouvrir-victor-hugo",
    brokenSlug: "stephane-haber-decouvrir-victor-hugo",
    note:
      "Produit réclamé par CETTE fiche ET par « decouvrir-le-programme-du-cnr » (entrée suivante). Le nom du " +
      "produit (« Stéphane Haber, Découvrir Victor Hugo ») correspond exactement à cette fiche-ci ; la seconde " +
      "réclamation ressemble à une erreur de saisie ACF (copier-coller) côté WordPress — son propre produit, " +
      "non réclamé par personne, existe séparément (« laurent-douzou-decouvrir-le-programme-du-cnr »).",
    candidate: "stephane-haber-decouvrir-victor-hugo",
    // Décision client (12/07) — règle « coquille de lien » : le nom du produit
    // (Store API live, id 2165) correspond exactement à CETTE fiche ; chacun
    // son produit (voir l'entrée suivante pour l'autre fiche).
    resolution: "stephane-haber-decouvrir-victor-hugo",
  },
  {
    category: "double-reclamation",
    bookSlug: "decouvrir-le-programme-du-cnr",
    brokenSlug: "stephane-haber-decouvrir-victor-hugo",
    note:
      "Voir l'entrée « decouvrir-victor-hugo » ci-dessus — cette fiche pointe vraisemblablement par erreur vers " +
      "le produit de Victor Hugo. Son propre produit boutique existe et n'est réclamé par personne : " +
      "« laurent-douzou-decouvrir-le-programme-du-cnr ».",
    candidate: "laurent-douzou-decouvrir-le-programme-du-cnr",
    // Décision client (12/07) : produit propre vérifié (Store API live, id
    // 2168, « Laurent Douzou, Découvrir le programme du CNR »), non réclamé
    // par ailleurs. ⚠️ À signaler côté client : le champ ACF `buy.boutiqueUrl`
    // de CETTE fiche WordPress pointe à tort vers le produit de Victor Hugo
    // (erreur de saisie probable, copier-coller) — correction à faire à la
    // source (WP), ce script ne peut pas la corriger (contrat lecture seule).
    resolution: "laurent-douzou-decouvrir-le-programme-du-cnr",
  },
];

export interface MatchedPair {
  book: BookRef;
  product: WcProduct;
}

export interface MatchResult {
  /** Appariements retenus — prêts pour l'écriture `commerce.sellable`/`prix`. */
  matched: MatchedPair[];
  /** Entrées d'arbitrage encore sans résolution — rapportées, rien n'est écrit. */
  pendingArbitrage: ArbitrageEntry[];
  /** Entrées arbitrées dont la résolution ne correspond à aucun produit courant (slug erroné ou produit disparu). */
  invalidResolutions: ArbitrageEntry[];
  /**
   * Conflit détecté a posteriori : un même produit réclamé par plusieurs
   * fiches sans que la table d'arbitrage n'ait tranché — anomalie non prévue
   * (garde-fou), jamais écrite automatiquement.
   */
  unexpectedDuplicates: { productSlug: string; bookSlugs: string[] }[];
  /** Produits jamais réclamés (ni match direct, ni arbitrage encore ouvert) → candidats à la création `origin: boutique`. */
  orphans: WcProduct[];
}

/**
 * Apparie chaque fiche à son produit boutique par slug (`slugFromBoutiqueLink`,
 * même clé que la fusion du front, `catalogue-core.ts`), en laissant la table
 * d'arbitrage trancher pour les fiches qu'elle couvre — ces fiches ne passent
 * JAMAIS par l'appariement « normal », qu'un lien mort recalculé coïncide ou
 * non avec autre chose.
 */
export function matchProducts(
  books: BookRef[],
  products: WcProduct[],
  arbitrages: ArbitrageEntry[],
): MatchResult {
  const productBySlug = new Map(products.map((p) => [p.slug, p]));
  const arbitrageByBookSlug = new Map(arbitrages.map((a) => [a.bookSlug, a]));

  const pendingArbitrage: ArbitrageEntry[] = [];
  const invalidResolutions: ArbitrageEntry[] = [];
  const candidates: MatchedPair[] = [];

  for (const book of books) {
    const arbitrage = arbitrageByBookSlug.get(book.slug);
    if (arbitrage) {
      if (arbitrage.resolution == null) {
        pendingArbitrage.push(arbitrage);
      } else {
        const product = productBySlug.get(arbitrage.resolution);
        if (product) candidates.push({ book, product });
        else invalidResolutions.push(arbitrage);
      }
      continue;
    }

    const raw = slugFromBoutiqueLink(book.boutiqueUrl);
    const product = raw ? productBySlug.get(raw) : undefined;
    if (product) candidates.push({ book, product });
  }

  // Détection de conflit a posteriori, tous chemins confondus (appariement
  // direct + arbitrages résolus) : une résolution humaine mal saisie (deux
  // fiches pointées vers le même slug produit) doit échouer aussi silencieusement
  // qu'une coïncidence de lien mort — jamais une écriture à l'aveugle.
  const bySlug = new Map<string, MatchedPair[]>();
  for (const c of candidates) {
    const arr = bySlug.get(c.product.slug) ?? [];
    arr.push(c);
    bySlug.set(c.product.slug, arr);
  }
  const matched: MatchedPair[] = [];
  const unexpectedDuplicates: MatchResult["unexpectedDuplicates"] = [];
  for (const [slug, arr] of bySlug) {
    if (arr.length === 1) matched.push(arr[0]);
    else unexpectedDuplicates.push({ productSlug: slug, bookSlugs: arr.map((c) => c.book.slug) });
  }

  // Produits réservés (jamais auto-créés en orphelins) : déjà appariés, OU
  // référencés — comme lien partagé réel ou comme piste candidate — par une
  // entrée d'arbitrage encore ouverte. Sans cette réserve, un produit disputé
  // entre deux éditions (ex. « Pensée et langage ») se retrouverait dupliqué
  // en fiche `origin: boutique` avant même que le client ait tranché.
  const reserved = new Set<string>(matched.map((m) => m.product.slug));
  for (const a of arbitrages) {
    if (productBySlug.has(a.brokenSlug)) reserved.add(a.brokenSlug);
    if (a.candidate && productBySlug.has(a.candidate)) reserved.add(a.candidate);
  }
  // Un conflit a posteriori (cf. ci-dessus) est aussi une réserve : un produit
  // disputé par une anomalie non prévue ne doit pas, en plus, se retrouver
  // dupliqué en fiche `origin: boutique` — il attend une table d'arbitrage
  // au même titre qu'un lien cassé connu.
  for (const d of unexpectedDuplicates) reserved.add(d.productSlug);
  const orphans = products.filter((p) => !reserved.has(p.slug));

  return { matched, pendingArbitrage, invalidResolutions, unexpectedDuplicates, orphans };
}

/** Titre WooCommerce (souvent `<i>…</i>` + entités HTML) → texte nu, même traitement que les fiches catalogue. */
export function cleanProductTitle(rawName: string): string {
  return decodeEntities(rawName.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Données `commerce`/`prix` à écrire sur une fiche déjà matchée — jamais `stock` (routeur/saisie manuelle ensuite, cf. mission). */
export interface MatchedBookUpdate {
  prix: number | null;
  sellable: true;
}

export function matchedBookUpdate(product: WcProduct): MatchedBookUpdate {
  return { prix: priceOf(product), sellable: true };
}

/**
 * Les produits boutique-seuls (goodies, manuels…) n'ont pas de vraie « date de
 * parution » — le champ est pourtant `required` côté schéma `Books`. Sentinelle
 * STABLE (jamais `new Date()`, qui casserait l'idempotence d'un run à l'autre
 * et polluerait le tri « nouveautés » du catalogue fusionné en faisant
 * remonter ces articles au sommet) plutôt qu'une vraie date, absente de la
 * Store API publique (pas de `date_created` exposé).
 */
export const ORPHAN_DATE_PARUTION = "2000-01-01T00:00:00.000Z";

/** Données d'une fiche `origin: boutique` créée pour un produit sans fiche catalogue — hors `presentation` (Lexical, construit par l'orchestrateur). */
export interface OrphanBookData {
  title: string;
  slug: string;
  edition: null;
  origin: "boutique";
  isbn: null;
  prix: number | null;
  dateParution: string;
  /** Idem `dateParution` : requis par le schéma, sans defaultValue exploitable via la Local API typée — même sentinelle stable. */
  sortDate: string;
  aParaitre: false;
  authors: number[];
  collection: null;
  coverFallbackUrl: string | null;
  commerce: { sellable: true };
}

export function orphanBookData(product: WcProduct): OrphanBookData {
  return {
    title: cleanProductTitle(product.name),
    slug: product.slug,
    edition: null,
    origin: "boutique",
    isbn: null,
    prix: priceOf(product),
    dateParution: ORPHAN_DATE_PARUTION,
    sortDate: ORPHAN_DATE_PARUTION,
    aParaitre: false,
    authors: [],
    collection: null,
    coverFallbackUrl: product.images?.[0]?.src ?? null,
    commerce: { sellable: true },
  };
}

/* ─────────────────────────── Table de redirections `/produit/<slug>` (plan/07-cloture.md, P7) ───────────────────────────
 *
 * Consommée par `scripts/build-product-redirects.ts` (orchestrateur I/O) puis
 * gravée dans `src/lib/redirects-produits.json` — artefact **versionné**,
 * généré une fois et réutilisé tel quel au Jour J (302, `next.config.ts`,
 * host `boutique.editionssociales.fr`) puis à la clôture (301, même table,
 * seul `REDIRECTS_PERMANENT` change) : contrairement à
 * `scripts/redirect-inventory.csv` (régénéré à chaque étape, jamais commité),
 * cette table-ci ne doit PAS diverger entre les deux moments — décision
 * d'arbitrage du plan.
 */

/**
 * Destination d'une redirection `/produit/<slug>` : une fiche catalogue
 * (`edition` non nul) ou une fiche `origin: "boutique"` (produit orphelin,
 * `edition: null`, destination `/boutique/<slug>`) — même disjonction que
 * `OrphanBookData`/`BookRef`.
 */
export interface ProductRedirectTarget {
  edition: EditionSlug | null;
  slug: string;
}

/** Table `/produit/<slug>` → fiche, clé = slug produit WooCommerce courant (+ alias historiques, cf. `buildProductRedirectTable`). */
export type ProductRedirectTable = Record<string, ProductRedirectTarget>;

/**
 * Construit la table de redirections à partir du résultat de `matchProducts`
 * (même entrée que les écritures Payload de `migrate-products.ts` — aucun
 * second calcul d'appariement, jamais deux tables qui pourraient diverger) :
 *
 * - un produit apparié (`matched`) → la fiche qui l'a réclamé (son édition,
 *   son slug ; `edition: null` si la fiche réclamante est elle-même une
 *   fiche `origin: "boutique"`, cas marginal mais géré sans écarter
 *   l'entrée) ;
 * - un lien cassé arbitré (`arbitrages[].resolution`) qui a effectivement
 *   abouti à un match : le slug ORIGINAL du lien mort (`brokenSlug`) reçoit
 *   la MÊME destination, en plus du slug produit courant — un lecteur/moteur
 *   de recherche a pu indexer cette URL avant même la dérive (jamais écrasé
 *   si le slug cassé coïncide, par malchance, avec un vrai produit courant) ;
 * - un produit non réclamé (`orphans`) → sa propre fiche `origin: "boutique"`
 *   (même slug, `orphanBookData`) : `edition: null`.
 *
 * `pendingArbitrage`/`invalidResolutions`/`unexpectedDuplicates` (attendus
 * vides, plan : « 208 produits appariés, 0 en attente ») ne produisent
 * aucune entrée — silence délibéré, symétrique du défaut conservateur de
 * `matchProducts` : un TODO ou un conflit ne doit jamais écrire une
 * redirection au hasard. L'appelant (`build-product-redirects.ts`) les
 * rapporte séparément.
 */
export function buildProductRedirectTable(
  match: MatchResult,
  arbitrages: ArbitrageEntry[],
): ProductRedirectTable {
  const table: ProductRedirectTable = {};

  for (const { book, product } of match.matched) {
    table[product.slug] = { edition: book.edition, slug: book.slug };
  }

  const matchedByBookSlug = new Map(match.matched.map((m) => [m.book.slug, m]));
  for (const a of arbitrages) {
    if (a.resolution == null) continue;
    const resolved = matchedByBookSlug.get(a.bookSlug);
    if (!resolved) continue; // TODO encore ouvert ou résolution invalide — rien à ajouter
    if (a.brokenSlug in table) continue; // ne jamais écraser une entrée déjà posée par un vrai produit homonyme
    table[a.brokenSlug] = { edition: resolved.book.edition, slug: resolved.book.slug };
  }

  for (const product of match.orphans) {
    table[product.slug] = { edition: null, slug: product.slug };
  }

  return table;
}
