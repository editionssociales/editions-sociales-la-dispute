/**
 * Migration des produits WooCommerce → Payload — commerce natif, phase 4
 * étape 4 (`plan/04-commerce.md`).
 *
 * `pnpm payload run scripts/migrate-products.ts -- [--dry-run] [--help]`
 *
 * Lit la Store API LIVE (`WC_STORE_URL`), apparie chaque produit à une fiche
 * `books` existante par slug — même clé que la fusion du front
 * (`slugFromBoutiqueLink`, `catalogue-core.ts`) — puis :
 *   1. fiche appariée → `commerce.sellable = true` + `prix` (TTC, Store API) ;
 *      `commerce.stock` n'est JAMAIS touché ici (routeur/saisie manuelle
 *      ensuite, cf. mission — le stock reste `null` = non suivi) ;
 *   2. produit sans fiche (« orphelin ») → nouvelle fiche `origin: "boutique"`,
 *      `edition: null` (route `/boutique/[slug]`, étape 7 du plan — pas
 *      encore branchée : cette fiche est invisible du front tant que la
 *      section n'existe pas) ;
 *   3. ~9 liens boutique cassés + 1 double réclamation connus (plan §Migration
 *      produits) → table `ARBITRAGES` ci-dessous, défaut conservateur : rien
 *      n'est écrit pour une fiche/un produit tant que `resolution` vaut
 *      `null` (TODO explicite, tranché par le client).
 *
 * Idempotent : chaque écriture compare l'existant à la valeur proposée avant
 * d'appeler `create`/`update` (même politique que `migrate-catalogue/import.ts`)
 * — un re-run sans changement de données source produit 0 création / 0 màj.
 *
 * Chaque écriture Payload passe `context: { migration: true, disableRevalidate: true }`
 * (contrat du dépôt, `CLAUDE.md`).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { editorConfigFactory, convertHTMLToLexical } from "@payloadcms/richtext-lexical";
// `jsdom` n'a pas ses propres types (même contrainte que `migrate-catalogue/import.ts` :
// aucune nouvelle dépendance, `@types/jsdom` n'est pas installé).
// @ts-expect-error -- pas de déclarations de types pour "jsdom"
import { JSDOM } from "jsdom";
import { getPayload, type Payload } from "payload";
import config from "../src/payload.config.ts";

import type { WcProduct } from "../src/lib/catalogue-source.ts";
import { fetchAllPages } from "../src/lib/fetch-all-pages.ts";
import type { Book } from "../src/payload-types.ts";

import { prepareHtmlForLexical } from "./migrate-catalogue/rewrite-html.ts";
import { createLogger, fetchWithRetry, type Logger } from "./migrate-catalogue/utils.ts";
import {
  matchedBookUpdate,
  matchProducts,
  orphanBookData,
  type ArbitrageEntry,
  type BookRef,
  type MatchResult,
} from "./migrate-products-core.ts";

const OUT_DIR = "scripts/migrate-catalogue/out";
const MIGRATION_CONTEXT = { migration: true, disableRevalidate: true };

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
 */
const ARBITRAGES: ArbitrageEntry[] = [
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

/* ─── Fiches tranchées « restent sans produit » (décisions client 12/07) ───────
 *
 * Ces cinq fiches n'ont plus d'entrée dans `ARBITRAGES` ci-dessus : une fois
 * la décision « pas de produit » actée, les laisser dans la table les ferait
 * apparaître indéfiniment comme « en attente d'arbitrage » dans le rapport
 * (TODO), alors que la décision est prise et définitive. Sans entrée, le
 * lien cassé de `buy.boutiqueUrl` ne correspond spontanément à aucun produit
 * (comportement normal de `matchProducts`) : la fiche reste simplement sans
 * commerce natif — documenté ici pour mémoire, avec la donnée qui tranche :
 *
 *   - `larrangement-des-sexes` (édition 2002, ISBN 9782843030536) — doublon,
 *     drop oldest : le produit unique de la famille (Store API live, id
 *     6825, « Erving Goffman, L'Arrangement des sexe ») est déjà réclamé par
 *     un lien DIRECT et valide sur `larrangement-des-sexes-nouvelle-edition`
 *     (2026, ISBN 9782843033582).
 *   - `le-capital-livre-1` (édition 2016, ISBN 9782353670123) — doublon, drop
 *     oldest : le produit unique (id 2294, « Karl Marx, Le Capital, Livre 1 »)
 *     est déjà réclamé par un lien direct et valide sur `le-capital-livre-1-2`
 *     (2022, ISBN 9782353670826). Sans rapport : `ludovic-hetzel-commenter-
 *     le-capital-livre-1` (le commentaire) et `lecapital` (fac-similé 1875)
 *     sont des produits distincts, non disputés.
 *   - `pensee-et-langage` (édition 2019, ISBN 9782843033018) — doublon, drop
 *     oldest : voir l'entrée `pensee-et-langage-2` ci-dessus, qui reçoit le
 *     produit disputé (édition 2025 plus récente).
 *   - `des-%e2%80%89heritiers%e2%80%89-en-echec-scolaire` (ISBN 9782843032073) —
 *     aucun produit correspondant sur les 223 de la Store API live (recherche
 *     exacte + par similarité titre/auteur, y compris « panabiere »,
 *     « heritier », « echec ») : rien à inventer.
 *   - `lecole-des-incapables` (ISBN 9782843032776) — même constat, aucun
 *     produit correspondant (recherche « incapable », « millet », « croizet »
 *     infructueuse).
 */

/* ─────────────────────────── CLI ─────────────────────────── */

const HELP = `Usage : pnpm payload run scripts/migrate-products.ts -- [options]

Migre les produits WooCommerce vers Payload (commerce natif, plan/04-commerce.md étape 4).

Options :
  --dry-run    N'écrit rien — calcule et rapporte les mêmes comptages.
  --help, -h   Affiche cette aide et quitte (aucune I/O réseau).
`;

interface CliOptions {
  dryRun: boolean;
  help: boolean;
}

function parseCliOptions(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });
  return { dryRun: values["dry-run"] === true, help: values.help === true };
}

/* ─────────────────────────── Store API (transport local — voir compare-sources.ts) ───────────────────────────
 *
 * `src/lib/boutique.ts` reste inimportable ici (`import "server-only"`) — même
 * contournement que `compare-sources.ts` : transport propre au script, réutilise
 * la politique de pagination pure (`fetch-all-pages.ts`). Le shape demandé est
 * plus riche que `WcProduct` (front) : `description`/`short_description`
 * alimentent la présentation Lexical des fiches orphelines créées ici.
 */
interface StoreProductRaw extends WcProduct {
  description?: string;
  short_description?: string;
}

async function fetchStoreProducts(): Promise<StoreProductRaw[]> {
  const base = process.env.WC_STORE_URL || "https://boutique.editionssociales.fr";
  const perPage = 100;
  return fetchAllPages<StoreProductRaw>({
    perPage,
    maxPages: 10,
    fetchPage: async (page) => {
      const res = await fetchWithRetry(
        `${base}/wp-json/wc/store/v1/products?per_page=${perPage}&page=${page}&orderby=date&order=desc`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items: unknown = await res.json();
      if (!Array.isArray(items)) throw new Error("réponse non-liste");
      return items;
    },
    onPageError: (err, page) => {
      throw new Error(
        `[migrate-products] Store API indisponible (page ${page}) : ${err instanceof Error ? err.message : err}`,
      );
    },
  });
}

/* ─────────────────────────── Payload (lecture des fiches) ─────────────────────────── */

async function fetchBooksWithBoutiqueLinks(payload: Payload): Promise<Book[]> {
  const { docs } = await payload.find({
    collection: "books",
    limit: 0,
    depth: 0,
    draft: true,
    sort: "id",
  });
  return docs;
}

function toBookRef(doc: Book): BookRef {
  return {
    id: doc.id,
    slug: doc.slug,
    edition: (doc.edition ?? null) as BookRef["edition"],
    boutiqueUrl: doc.buy?.boutiqueUrl ?? null,
    published: doc._status === "published",
  };
}

/* ─────────────────────────── Présentation Lexical (fiches orphelines) ───────────────────────────
 *
 * Pas de rapatriement média ici (lot « données » — la rehostage des visuels
 * boutique reste un chantier ultérieur, plan étape 7) : tout `<img>` du HTML
 * WooCommerce est retiré de l'entrée Lexical (aucun média Payload connu),
 * l'URL d'origine est conservée en repli (`coverFallbackUrl`, posé par
 * `orphanBookData`). `presentation` reste `required` côté schéma `Books` —
 * et Payload considère un unique paragraphe VIDE (`<p></p>` → un nœud sans
 * enfant) comme une absence de contenu (« Ce champ est requis », vérifié :
 * 5 produits sans `description` NI `short_description` faisaient échouer la
 * création) : `NO_DESCRIPTION_PLACEHOLDER` fournit un texte réel, qui
 * satisfait la validation et documente honnêtement l'état de la fiche.
 */
const NO_DESCRIPTION_PLACEHOLDER =
  "<p>Fiche importée automatiquement depuis la boutique — présentation à compléter.</p>";

async function buildOrphanPresentation(
  editorConfig: Parameters<typeof convertHTMLToLexical>[0]["editorConfig"],
  product: StoreProductRaw,
  logger: Logger,
) {
  const source = (product.description?.trim() || product.short_description?.trim() || "").trim();
  const prep = prepareHtmlForLexical(source || NO_DESCRIPTION_PLACEHOLDER, new Map());
  if (prep.removedImgs.length > 0) {
    logger.warn(
      `[migrate-products] ${product.slug} : <img> retiré(s) de la présentation (pas de rapatriement média dans ce lot) : ${prep.removedImgs.join(", ")}`,
    );
  }
  return convertHTMLToLexical({ editorConfig, html: prep.html, JSDOM });
}

/** Message d'erreur détaillé (sous-erreurs de validation Payload incluses) — même politique que `migrate-catalogue/import.ts`. */
function errorDetail(e: unknown): string {
  const base = e instanceof Error ? e.message : String(e);
  const data = (e as { data?: { errors?: { path?: string; message?: string }[] } } | undefined)?.data;
  const sub = data?.errors?.map((x) => `${x.path}: ${x.message}`).join(" | ") ?? "";
  return sub ? `${base} — ${sub}` : base;
}

/* ─────────────────────────── Écritures ─────────────────────────── */

interface WriteReport {
  matchedUpdated: { bookSlug: string; productSlug: string }[];
  matchedUnchanged: number;
  matchedSkippedUnpublished: { bookSlug: string; productSlug: string }[];
  orphansCreated: { slug: string; title: string }[];
  orphansUpdated: { slug: string; title: string }[];
  orphansUnchanged: number;
  failed: { context: string; error: string }[];
}

async function applyMatched(
  payload: Payload,
  matched: MatchResult["matched"],
  booksById: Map<number, Book>,
  report: WriteReport,
  logger: Logger,
  dryRun: boolean,
): Promise<void> {
  for (const { book, product } of matched) {
    const existing = booksById.get(book.id)!;
    const update = matchedBookUpdate(product);
    const alreadySellable = existing.commerce?.sellable === true;
    const samePrix = (existing.prix ?? null) === (update.prix ?? null);
    if (alreadySellable && samePrix) {
      report.matchedUnchanged++;
      continue;
    }
    if (!book.published) {
      report.matchedSkippedUnpublished.push({ bookSlug: book.slug, productSlug: product.slug });
      logger.warn(
        `[migrate-products] ${book.slug} : appariée à ${product.slug} mais fiche non publiée (_status ≠ published) — commerce non écrit.`,
      );
      continue;
    }
    if (!dryRun) {
      try {
        await payload.update({
          collection: "books",
          id: book.id,
          data: { prix: update.prix, commerce: { sellable: true } },
          context: MIGRATION_CONTEXT,
        });
      } catch (e) {
        report.failed.push({
          context: `maj commerce ${book.slug}`,
          error: errorDetail(e),
        });
        continue;
      }
    }
    report.matchedUpdated.push({ bookSlug: book.slug, productSlug: product.slug });
  }
}

async function applyOrphans(
  payload: Payload,
  orphans: WcProduct[],
  editorConfig: Parameters<typeof convertHTMLToLexical>[0]["editorConfig"],
  report: WriteReport,
  logger: Logger,
  dryRun: boolean,
): Promise<void> {
  for (const product of orphans as StoreProductRaw[]) {
    const data = orphanBookData(product);

    const { docs } = await payload.find({
      collection: "books",
      where: { and: [{ slug: { equals: data.slug } }, { origin: { equals: "boutique" } }] },
      limit: 1,
      depth: 0,
      draft: true,
    });
    const existing = docs[0];

    if (!existing) {
      if (!dryRun) {
        const presentation = await buildOrphanPresentation(editorConfig, product, logger);
        try {
          await payload.create({
            collection: "books",
            data: { ...data, presentation },
            draft: false,
            context: MIGRATION_CONTEXT,
          });
        } catch (e) {
          report.failed.push({
            context: `création orpheline ${data.slug}`,
            error: errorDetail(e),
          });
          continue;
        }
      }
      report.orphansCreated.push({ slug: data.slug, title: data.title });
      continue;
    }

    const sameTitle = existing.title === data.title;
    const samePrix = (existing.prix ?? null) === (data.prix ?? null);
    const sameSellable = existing.commerce?.sellable === true;
    if (sameTitle && samePrix && sameSellable) {
      report.orphansUnchanged++;
      continue;
    }
    if (!dryRun) {
      try {
        await payload.update({
          collection: "books",
          id: existing.id,
          data: { title: data.title, prix: data.prix, commerce: { sellable: true } },
          context: MIGRATION_CONTEXT,
        });
      } catch (e) {
        report.failed.push({
          context: `maj orpheline ${data.slug}`,
          error: errorDetail(e),
        });
        continue;
      }
    }
    report.orphansUpdated.push({ slug: data.slug, title: data.title });
  }
}

/* ─────────────────────────── Rapport ─────────────────────────── */

function buildMarkdown(input: {
  startedAt: number;
  dryRun: boolean;
  productsTotal: number;
  booksWithLink: number;
  match: MatchResult;
  write: WriteReport;
}): string {
  const { match, write } = input;
  const durationS = ((Date.now() - input.startedAt) / 1000).toFixed(1);
  const lines: string[] = [];
  lines.push("# Rapport de migration produits (commerce natif, étape 4)", "");
  lines.push(
    `Mode : ${input.dryRun ? "**dry-run** (aucune écriture)" : "écriture réelle"} · Durée : ${durationS}s`,
    "",
  );

  lines.push("## Comptages", "");
  lines.push(`- Produits Store API : ${input.productsTotal}`);
  lines.push(`- Fiches avec un lien boutique : ${input.booksWithLink}`);
  lines.push(`- Appariées (hors arbitrage) : ${match.matched.length}`);
  lines.push(`- En attente d'arbitrage (TODO) : ${match.pendingArbitrage.length}`);
  lines.push(`- Résolutions invalides : ${match.invalidResolutions.length}`);
  lines.push(`- Conflits inattendus : ${match.unexpectedDuplicates.length}`);
  lines.push(`- Orphelins (candidats \`origin: boutique\`) : ${match.orphans.length}`);
  lines.push("");

  lines.push("## Fiches — commerce natif", "");
  lines.push(`${write.matchedUpdated.length} mise(s) à jour, ${write.matchedUnchanged} inchangée(s).`);
  if (write.matchedSkippedUnpublished.length > 0) {
    lines.push("");
    lines.push(
      `⚠️ ${write.matchedSkippedUnpublished.length} fiche(s) appariée(s) mais non publiée(s) — commerce non écrit :`,
    );
    write.matchedSkippedUnpublished.forEach((s) => lines.push(`- \`${s.bookSlug}\` → ${s.productSlug}`));
  }
  lines.push("");

  lines.push("## Fiches orphelines (`origin: boutique`)", "");
  lines.push(
    `${write.orphansCreated.length} créée(s), ${write.orphansUpdated.length} mise(s) à jour, ${write.orphansUnchanged} inchangée(s).`,
  );
  if (write.orphansCreated.length > 0) {
    lines.push("");
    write.orphansCreated.forEach((o) => lines.push(`- \`${o.slug}\` — ${o.title}`));
  }
  lines.push("");

  lines.push("## En attente d'arbitrage (TODO — rien n'est écrit)", "");
  if (match.pendingArbitrage.length === 0) {
    lines.push("Aucune.");
  } else {
    for (const a of match.pendingArbitrage) {
      lines.push(
        `- **${a.category}** \`${a.bookSlug}\` ← \`${a.brokenSlug}\`${a.candidate ? ` (piste : \`${a.candidate}\`)` : " (aucune piste trouvée)"}`,
      );
      lines.push(`  ${a.note}`);
    }
  }
  lines.push("");

  if (match.invalidResolutions.length > 0) {
    lines.push("## ⚠️ Résolutions invalides (slug sans produit courant)", "");
    for (const a of match.invalidResolutions) {
      lines.push(`- \`${a.bookSlug}\` → \`${a.resolution}\` (introuvable dans la Store API courante)`);
    }
    lines.push("");
  }

  if (match.unexpectedDuplicates.length > 0) {
    lines.push("## ⚠️ Conflits inattendus (garde-fou — rien n'est écrit)", "");
    for (const d of match.unexpectedDuplicates) {
      lines.push(`- \`${d.productSlug}\` réclamé par : ${d.bookSlugs.map((s) => `\`${s}\``).join(", ")}`);
    }
    lines.push("");
  }

  if (write.failed.length > 0) {
    lines.push("## ❌ Échecs d'écriture", "");
    for (const f of write.failed) lines.push(`- ${f.context} : ${f.error}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function writeReport(md: string, json: unknown): Promise<{ mdPath: string; jsonPath: string }> {
  await mkdir(OUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const mdPath = path.join(OUT_DIR, `migrate-products-report-${ts}.md`);
  const jsonPath = path.join(OUT_DIR, `migrate-products-report-${ts}.json`);
  await writeFile(mdPath, md, "utf8");
  await writeFile(jsonPath, JSON.stringify(json, null, 2), "utf8");
  return { mdPath, jsonPath };
}

/* ─────────────────────────── main ─────────────────────────── */

async function main(): Promise<void> {
  const opts = parseCliOptions(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const startedAt = Date.now();
  const logger = createLogger();
  logger.info(`[migrate-products] démarrage — dry-run=${opts.dryRun}`);

  const products = await fetchStoreProducts();
  logger.info(`[migrate-products] ${products.length} produit(s) Store API récupéré(s).`);

  const payload = await getPayload({ config });
  try {
    const bookDocs = await fetchBooksWithBoutiqueLinks(payload);
    const booksById = new Map(bookDocs.map((b) => [b.id, b]));
    const bookRefs = bookDocs.map(toBookRef);
    const booksWithLink = bookRefs.filter((b) => b.boutiqueUrl != null).length;

    const match = matchProducts(bookRefs, products, ARBITRAGES);
    logger.info(
      `[migrate-products] appariement : ${match.matched.length} matché(s), ${match.pendingArbitrage.length} en attente d'arbitrage, ` +
        `${match.invalidResolutions.length} résolution(s) invalide(s), ${match.unexpectedDuplicates.length} conflit(s), ${match.orphans.length} orphelin(s).`,
    );

    const editorConfig = await editorConfigFactory.default({ config: payload.config });

    const write: WriteReport = {
      matchedUpdated: [],
      matchedUnchanged: 0,
      matchedSkippedUnpublished: [],
      orphansCreated: [],
      orphansUpdated: [],
      orphansUnchanged: 0,
      failed: [],
    };

    await applyMatched(payload, match.matched, booksById, write, logger, opts.dryRun);
    await applyOrphans(payload, match.orphans, editorConfig, write, logger, opts.dryRun);

    const md = buildMarkdown({
      startedAt,
      dryRun: opts.dryRun,
      productsTotal: products.length,
      booksWithLink,
      match,
      write,
    });
    const jsonReport = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      dryRun: opts.dryRun,
      productsTotal: products.length,
      booksWithLink,
      matched: match.matched.length,
      pendingArbitrage: match.pendingArbitrage,
      invalidResolutions: match.invalidResolutions,
      unexpectedDuplicates: match.unexpectedDuplicates,
      orphansTotal: match.orphans.length,
      write,
    };
    const { mdPath, jsonPath } = await writeReport(md, jsonReport);
    logger.info(`[migrate-products] rapport écrit : ${mdPath} / ${jsonPath}`);
    logger.info(
      `[migrate-products] terminé en ${((Date.now() - startedAt) / 1000).toFixed(1)}s — ` +
        `fiches : ${write.matchedUpdated.length} maj/${write.matchedUnchanged} inchangée(s) ; ` +
        `orphelins : ${write.orphansCreated.length} créé(s)/${write.orphansUpdated.length} maj/${write.orphansUnchanged} inchangé(s).`,
    );

    if (write.failed.length > 0) {
      throw new Error(
        `${write.failed.length} échec(s) d'écriture (détail dans le rapport) : ` +
          write.failed.map((f) => f.context).join(", "),
      );
    }
  } finally {
    await payload.destroy();
  }
}

// Top-level await obligatoire : `payload run` fait `process.exit(0)` dès que
// l'import du module est résolu (contrainte du dépôt, cf. `migrate-catalogue/index.ts`).
try {
  await main();
  process.exit(0);
} catch (err) {
  console.error("[migrate-products] ÉCHEC —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
}
