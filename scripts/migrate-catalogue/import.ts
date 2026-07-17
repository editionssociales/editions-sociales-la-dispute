/**
 * Écriture dans Payload (Local API) : upsert `authors`, `collections`, `books`,
 * puis balayage des suppressions (jamais de delete — passage en `draft`).
 *
 * Chaque `create`/`update` passe `context: { migration: true, disableRevalidate: true }`
 * — neutralise le hook `contentTouched` et la revalidation Next pendant l'import
 * (E3 : sans quoi ~295 appels de revalidation hors contexte Next planteraient,
 * et chaque fiche basculerait en rendu Lexical, désamorçant le parachute
 * `*LegacyHtml`).
 *
 * Note de typage : `payload-types.ts` n'existe pas encore (dépend du scaffold
 * Payload d'un autre chantier, E2/E4, en cours en parallèle dans ce même
 * worktree) — les appels Local API sont volontairement non génériques
 * (`unknown`/casts explicites) plutôt que couplés à un schéma pas encore écrit.
 * Le reste du module reste typé normalement.
 */
import { convertHTMLToLexical, editorConfigFactory } from "@payloadcms/richtext-lexical";
// `jsdom` ne fournit pas ses propres types et `@types/jsdom` n'est pas installé
// (contrainte de la mission : aucune nouvelle dépendance) — import non typé,
// explicitement annoté plutôt que masqué.
// @ts-expect-error -- pas de déclarations de types pour "jsdom"
import { JSDOM } from "jsdom";
import type { Payload } from "payload";

import { displayAuthor } from "../../src/lib/format.ts";

import type { WpCatalogueRaw } from "./fetch-wp.ts";
import type { BookMediaResolution } from "./media.ts";
import { prepareHtmlForLexical } from "./rewrite-html.ts";
import {
  collectionKey,
  deepEqual,
  decodeEntities,
  EDITION_BY_SITE,
  parsePages,
  parsePrice,
  parseWpDate,
  trimIsbn,
  wpSourceKey,
  type EditionSlug,
  type Logger,
  type Site,
} from "./utils.ts";

/* ─────────────────────────── Local API, dé-typée volontairement ─────────────────────────── */

interface FindResult<T = Record<string, unknown>> {
  docs: T[];
}
interface LooseDoc {
  id: number;
  [key: string]: unknown;
}
interface LoosePayload {
  find: (args: Record<string, unknown>) => Promise<FindResult<LooseDoc>>;
  create: (args: Record<string, unknown>) => Promise<LooseDoc>;
  update: (args: Record<string, unknown>) => Promise<LooseDoc>;
}
function loose(payload: Payload): LoosePayload {
  return payload as unknown as LoosePayload;
}

const MIGRATION_CONTEXT = { migration: true, disableRevalidate: true };

/**
 * Normalise les 3 champs `date` avant comparaison d'idempotence : Postgres/Payload
 * renvoie un timestamp ISO complet (`2026-08-21T00:00:00.000Z`) même quand on a
 * écrit une date nue (`2026-08-21`) — une comparaison de string brute détecterait
 * à tort une différence à **chaque** re-run (violerait la preuve d'idempotence,
 * cf. plan §E3 : « re-run → 0 création, updates no-op »). On compare des epoch.
 */
function toEpoch(v: unknown): number | null {
  if (v == null) return null;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Canonicalise un état Lexical pour comparaison : Payload enrichit les nœuds au
 * stockage de propriétés par défaut absentes de la sortie de `convertHTMLToLexical`
 * (`textFormat: 0`, `textStyle: ""` sur les paragraphes, etc.). On retire
 * symétriquement des DEUX côtés toute valeur « défaut » (null, "", 0, false,
 * objet vide) — les valeurs significatives (format gras = 1, ids, texte) restent.
 */
function canonicalizeLexical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalizeLexical);
  if (v != null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === undefined || val === null || val === "" || val === 0 || val === false) continue;
      // Les link nodes reçoivent un `id` ObjectID ALÉATOIRE à chaque
      // `convertHTMLToLexical` — différent à chaque run, sans valeur sémantique.
      if (k === "id" && typeof val === "string" && /^[0-9a-f]{24}$/.test(val)) continue;
      const canon = canonicalizeLexical(val);
      if (canon != null && typeof canon === "object" && !Array.isArray(canon) && Object.keys(canon).length === 0) {
        continue;
      }
      out[k] = canon;
    }
    return out;
  }
  return v;
}

function comparableBookData(d: Record<string, unknown>): Record<string, unknown> {
  const wpSource = d.wpSource as Record<string, unknown> | null | undefined;
  return {
    ...d,
    presentation: canonicalizeLexical(d.presentation),
    plusLoin: canonicalizeLexical(d.plusLoin),
    dateParution: toEpoch(d.dateParution),
    sortDate: toEpoch(d.sortDate),
    wpSource: wpSource ? { ...wpSource, wpDate: toEpoch(wpSource.wpDate) } : wpSource,
  };
}

async function findOne(
  payload: Payload,
  collection: string,
  where: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<LooseDoc | null> {
  const res = await loose(payload).find({ collection, where, limit: 1, depth: 0, draft: true, ...extra });
  return res.docs[0] ?? null;
}

/* ─────────────────────────── Authors ─────────────────────────── */

/**
 * `Nom / Prénom` (WordPress) → `Prénom Nom` (Payload), conversion faite une
 * seule fois à l'import — `displayAuthor` (`src/lib/format.ts`), importée en
 * RELATIF plutôt que recopiée : l'alias `@/*` n'est pas fiable sous
 * `payload run`, mais l'import relatif fonctionne (précédent :
 * `scripts/compare-sources.ts`).
 */

export interface AuthorDivergence {
  slug: string;
  existingName: string;
  incomingName: string;
  site: Site;
  resolvedToLd: boolean;
}

export interface UpsertAuthorsResult {
  bySlug: Map<string, number>;
  created: number;
  updated: number;
  unchanged: number;
  divergences: AuthorDivergence[];
}

/**
 * Dédoublonnage **global** par slug entre ES et LD : un simple find-or-create
 * par slug suffit — que le run traite un site ou les deux, l'unicité de
 * `authors.slug` fait naturellement converger les deux fonds au fil des runs.
 * Divergence de `name` à slug égal : la graphie du site **LD** est retenue
 * (on traite ES avant LD dans un même run pour garantir ce résultat quel que
 * soit l'ordre d'itération naturel).
 */
export async function upsertAuthors(
  payload: Payload,
  sites: Site[],
  itemsBySite: Partial<Record<Site, WpCatalogueRaw[]>>,
  logger: Logger,
  dryRun: boolean,
): Promise<UpsertAuthorsResult> {
  const bySlug = new Map<string, number>();
  const divergences: AuthorDivergence[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  const orderedSites = [...sites].sort((a) => (a === "ld" ? 1 : -1));

  for (const site of orderedSites) {
    const items = itemsBySite[site] ?? [];
    const seen = new Set<string>();
    for (const item of items) {
      for (const author of item.book?.authors ?? []) {
        if (!author?.slug || seen.has(author.slug)) continue;
        seen.add(author.slug);
        const displayName = displayAuthor(author.name);

        const existing = await findOne(payload, "authors", { slug: { equals: author.slug } });
        if (!existing) {
          if (dryRun) {
            bySlug.set(author.slug, -1);
          } else {
            const doc = await loose(payload).create({
              collection: "authors",
              data: { name: displayName, slug: author.slug },
              context: MIGRATION_CONTEXT,
            });
            bySlug.set(author.slug, doc.id);
          }
          created++;
          continue;
        }

        bySlug.set(author.slug, existing.id);
        if (existing.name !== displayName) {
          divergences.push({
            slug: author.slug,
            existingName: String(existing.name),
            incomingName: displayName,
            site,
            resolvedToLd: site === "ld",
          });
          if (site === "ld") {
            if (!dryRun) {
              await loose(payload).update({
                collection: "authors",
                id: existing.id,
                data: { name: displayName },
                context: MIGRATION_CONTEXT,
              });
            }
            updated++;
          } else {
            // ES ne doit jamais écraser une graphie déjà posée (LD prévaut).
            unchanged++;
          }
        } else {
          unchanged++;
        }
      }
    }
  }

  logger.info(
    `[import] authors : ${created} créé(s), ${updated} maj, ${unchanged} inchangé(s), ${divergences.length} divergence(s) de graphie.`,
  );
  return { bySlug, created, updated, unchanged, divergences };
}

/* ─────────────────────────── Collections ─────────────────────────── */

export interface UpsertCollectionsResult {
  /** clé `${edition}:${slug}` → id Payload. */
  byKey: Map<string, number>;
  created: number;
  updated: number;
  unchanged: number;
}

export async function upsertCollections(
  payload: Payload,
  sites: Site[],
  itemsBySite: Partial<Record<Site, WpCatalogueRaw[]>>,
  logger: Logger,
  dryRun: boolean,
): Promise<UpsertCollectionsResult> {
  const byKey = new Map<string, number>();
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const site of sites) {
    const edition = EDITION_BY_SITE[site];
    const items = itemsBySite[site] ?? [];
    const seen = new Set<string>();
    for (const item of items) {
      const col = item.book?.collection;
      if (!col?.slug || seen.has(col.slug)) continue;
      seen.add(col.slug);
      const key = collectionKey(edition, col.slug);

      const existing = await findOne(payload, "collections", {
        and: [{ edition: { equals: edition } }, { slug: { equals: col.slug } }],
      });
      if (!existing) {
        if (dryRun) {
          byKey.set(key, -1);
        } else {
          const doc = await loose(payload).create({
            collection: "collections",
            data: { name: col.name, slug: col.slug, edition },
            context: MIGRATION_CONTEXT,
          });
          byKey.set(key, doc.id);
        }
        created++;
        continue;
      }
      byKey.set(key, existing.id);
      if (existing.name !== col.name) {
        if (!dryRun) {
          await loose(payload).update({
            collection: "collections",
            id: existing.id,
            data: { name: col.name },
            context: MIGRATION_CONTEXT,
          });
        }
        updated++;
      } else {
        unchanged++;
      }
    }
  }

  logger.info(
    `[import] collections : ${created} créée(s), ${updated} maj, ${unchanged} inchangée(s).`,
  );
  return { byKey, created, updated, unchanged };
}

/* ─────────────────────────── Books ─────────────────────────── */

export interface BookImportContext {
  site: Site;
  item: WpCatalogueRaw;
  aParaitre: boolean;
  media: BookMediaResolution;
  /** HTML `content.rendered`, URLs déjà réécrites vers Payload/Blob (`rewrite-html.ts`). */
  rewrittenContentHtml: string;
  /** HTML `book.plus_loin` (patché si besoin par l'oracle SQL), réécrit ; `null` si vide. */
  rewrittenPlusLoinHtml: string | null;
}

export interface BooksUpsertReport {
  created: number;
  updated: number;
  unchanged: number;
  createdList: { site: Site; wpId: number; slug: string }[];
  updatedList: { site: Site; wpId: number; slug: string }[];
  /** Fiches dont le create/update a échoué (validation…) — le run continue et échoue bruyamment à la fin. */
  failed: { site: Site; wpId: number; slug: string; error: string }[];
  /** Auteurs référencés par une fiche mais absents du registre (upsert manqué) — ne devrait jamais arriver. */
  missingAuthorRefs: { site: Site; wpId: number; slug: string }[];
  /** Fiches dont `contentTouched === true` en base — attendu : 0 après tout run d'import. */
  contentTouchedKeys: { site: Site; wpId: number; slug: string }[];
  /** Clé `${wpSource.site}:${wpSource.wpId}` de toutes les fiches traitées (capture de ce run) — pour le balayage des suppressions. */
  capturedKeys: Set<string>;
}

/**
 * Le convertisseur DOM→Lexical de Payload pose `value: id` en **string**
 * (`conversions.js` lit l'attribut `data-lexical-upload-id` sans cast — contrat
 * pensé pour les ObjectID Mongo). L'adaptateur Postgres exige un id numérique :
 * sans cette normalisation, chaque upload node échoue en validation
 * (« pas un valide identifiant de fichier ») et la fiche entière refuse de sauver.
 */
function coerceUploadIds<T>(lexical: T): T {
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== "object") return;
    const n = node as { type?: string; value?: unknown; children?: unknown[] };
    if (n.type === "upload" && typeof n.value === "string" && /^\d+$/.test(n.value)) {
      n.value = Number(n.value);
    }
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk((lexical as { root?: unknown }).root);
  return lexical;
}

/** Construit les données `books` mappées depuis le brut REST + résolutions médias/oracle. */
async function buildBookData(
  ctx: BookImportContext,
  editorConfig: Parameters<typeof convertHTMLToLexical>[0]["editorConfig"],
  authorsBySlug: Map<string, number>,
  collectionsByKey: Map<string, number>,
  logger: Logger,
): Promise<{ data: Record<string, unknown>; missingAuthors: string[] }> {
  const { site, item, aParaitre, media } = ctx;
  const edition = EDITION_BY_SITE[site];
  const book = item.book;

  const authorIds: number[] = [];
  const missingAuthors: string[] = [];
  for (const a of book?.authors ?? []) {
    const id = a?.slug ? authorsBySlug.get(a.slug) : undefined;
    if (id == null) {
      if (a?.slug) missingAuthors.push(a.slug);
      continue;
    }
    authorIds.push(id);
  }

  const collectionId = book?.collection?.slug
    ? (collectionsByKey.get(collectionKey(edition, book.collection.slug)) ?? null)
    : null;

  // Préparation Lexical (annotation des uploads, déballage des liens invalides) :
  // appliquée à l'ENTRÉE de conversion seulement — les snapshots `*LegacyHtml`
  // gardent le HTML réécrit tel quel, sans attributs data-lexical-*.
  const prepContent = prepareHtmlForLexical(ctx.rewrittenContentHtml, media.embeddedIdByFinalUrl);
  const prepPlusLoin =
    ctx.rewrittenPlusLoinHtml && ctx.rewrittenPlusLoinHtml.trim() !== ""
      ? prepareHtmlForLexical(ctx.rewrittenPlusLoinHtml, media.embeddedIdByFinalUrl)
      : null;
  for (const src of [...prepContent.removedImgs, ...(prepPlusLoin?.removedImgs ?? [])]) {
    logger.warn(
      `[import] ${site}#${item.id} (${item.slug}) : <img> sans média Payload retiré du Lexical (conservé dans le HTML legacy) : ${src}`,
    );
  }
  for (const href of [...prepContent.unwrappedLinks, ...(prepPlusLoin?.unwrappedLinks ?? [])]) {
    logger.warn(
      `[import] ${site}#${item.id} (${item.slug}) : lien à URL invalide déballé en texte dans le Lexical : ${href}`,
    );
  }

  const presentation = coerceUploadIds(
    convertHTMLToLexical({ editorConfig, html: prepContent.html, JSDOM }),
  );
  const plusLoin = prepPlusLoin
    ? coerceUploadIds(convertHTMLToLexical({ editorConfig, html: prepPlusLoin.html, JSDOM }))
    : null;

  const data: Record<string, unknown> = {
    title: decodeEntities(item.title.rendered),
    slug: item.slug,
    edition,
    origin: "catalogue",
    presentation,
    presentationLegacyHtml: ctx.rewrittenContentHtml,
    plusLoin,
    plusLoinLegacyHtml: plusLoin ? ctx.rewrittenPlusLoinHtml : null,
    isbn: trimIsbn(book?.isbn),
    prix: parsePrice(book?.prix),
    pages: parsePages(book?.pages),
    // Minuit UTC explicite : un `YYYY-MM-DD` nu est parsé minuit UTC par JS mais
    // minuit LOCAL par le champ date Payload — le décalage (2 h à Paris) casserait
    // l'idempotence (295 « maj » à chaque re-run) et déplacerait la date d'un jour
    // pour tout consommateur qui formate en UTC (mapper E4).
    dateParution: parseWpDate(book?.date_parution)
      ? `${parseWpDate(book?.date_parution)}T00:00:00.000Z`
      : null,
    // `post_date` WP est un datetime NAÏF (sans offset) : interprété en TZ
    // locale du process, la même chaîne donnerait des instants différents
    // d'une machine à l'autre (poste dev vs CI) — idempotence cassée. Le
    // suffixe Z fige l'interprétation ; la parité d'ordre avec
    // `ORDER BY post_date` de WordPress est exactement préservée (mapping
    // monotone du naïf).
    sortDate: `${item.date}Z`,
    aParaitre,
    authors: authorIds,
    collection: collectionId,
    cover: media.coverMediaId,
    coverFallbackUrl: media.coverFallbackUrl,
    tablePdf: media.tablePdfId,
    extraitPdf: media.extraitPdfId,
    buy: {
      boutiqueUrl: book?.boutique ?? null,
      parislibrairies: book?.parislibrairies ?? null,
      lalibrairie: book?.lalibrairie ?? null,
    },
    wpSource: {
      site: edition,
      wpId: item.id,
      wpSlug: item.slug,
      wpDate: `${item.date}Z`,
    },
    _status: "published",
  };

  if (missingAuthors.length > 0) {
    logger.warn(
      `[import] ${site}#${item.id} (${item.slug}) : auteur(s) sans id résolu (${missingAuthors.join(", ")}) — vérifier le registre d'auteurs.`,
    );
  }

  return { data, missingAuthors };
}

export async function upsertBooks(
  payload: Payload,
  contexts: BookImportContext[],
  authorsBySlug: Map<string, number>,
  collectionsByKey: Map<string, number>,
  logger: Logger,
  dryRun: boolean,
): Promise<BooksUpsertReport> {
  const editorConfig = await editorConfigFactory.default({ config: payload.config });

  const report: BooksUpsertReport = {
    created: 0,
    updated: 0,
    unchanged: 0,
    createdList: [],
    updatedList: [],
    failed: [],
    missingAuthorRefs: [],
    contentTouchedKeys: [],
    capturedKeys: new Set(),
  };

  const recordFailure = (ctx: BookImportContext, e: unknown) => {
    const err = e as { message?: string; data?: { errors?: { path?: string; message?: string }[] } };
    const detail = err.data?.errors?.map((x) => `${x.path}: ${x.message}`).join(" | ") ?? "";
    report.failed.push({
      site: ctx.site,
      wpId: ctx.item.id,
      slug: ctx.item.slug,
      error: `${err.message ?? String(e)}${detail ? ` — ${detail}` : ""}`,
    });
    logger.warn(`[import] ÉCHEC fiche ${ctx.site}#${ctx.item.id} (${ctx.item.slug}) : ${err.message} ${detail}`);
  };

  for (const ctx of contexts) {
    const edition = EDITION_BY_SITE[ctx.site];
    const key = wpSourceKey(edition, ctx.item.id);
    report.capturedKeys.add(key);

    const { data, missingAuthors } = await buildBookData(
      ctx,
      editorConfig,
      authorsBySlug,
      collectionsByKey,
      logger,
    );
    if (missingAuthors.length > 0) {
      report.missingAuthorRefs.push({ site: ctx.site, wpId: ctx.item.id, slug: ctx.item.slug });
    }

    const existing = await findOne(payload, "books", {
      and: [{ "wpSource.site": { equals: edition } }, { "wpSource.wpId": { equals: ctx.item.id } }],
    });

    if (!existing) {
      if (!dryRun) {
        try {
          await loose(payload).create({
            collection: "books",
            data,
            draft: false,
            context: MIGRATION_CONTEXT,
          });
        } catch (e) {
          recordFailure(ctx, e);
          continue;
        }
      }
      report.created++;
      report.createdList.push({ site: ctx.site, wpId: ctx.item.id, slug: ctx.item.slug });
      continue;
    }

    if (existing.contentTouched === true) {
      report.contentTouchedKeys.push({ site: ctx.site, wpId: ctx.item.id, slug: ctx.item.slug });
    }

    // Comparable construit sur le même shape que `data` (jamais `contentTouched`,
    // qu'on ne pose ni ne compare : c'est le territoire exclusif du hook `beforeChange`).
    const prevComparable = {
      title: existing.title,
      slug: existing.slug,
      edition: existing.edition,
      origin: existing.origin,
      presentation: existing.presentation,
      presentationLegacyHtml: existing.presentationLegacyHtml,
      plusLoin: existing.plusLoin,
      plusLoinLegacyHtml: existing.plusLoinLegacyHtml,
      isbn: existing.isbn,
      prix: existing.prix,
      pages: existing.pages,
      dateParution: existing.dateParution,
      sortDate: existing.sortDate,
      aParaitre: existing.aParaitre,
      authors: existing.authors,
      collection: existing.collection,
      cover: existing.cover,
      coverFallbackUrl: existing.coverFallbackUrl,
      tablePdf: existing.tablePdf,
      extraitPdf: existing.extraitPdf,
      buy: existing.buy,
      wpSource: existing.wpSource,
      _status: existing._status,
    };

    const nextCmp = comparableBookData(data);
    const prevCmp = comparableBookData(prevComparable);
    if (deepEqual(nextCmp, prevCmp)) {
      report.unchanged++;
      continue;
    }
    if (process.env.MIGRATE_DEBUG_DIFF && report.updated < 3) {
      const firstDiffPath = (a: unknown, b: unknown, path = "$"): string | null => {
        if (deepEqual(a, b)) return null;
        if (a == null || b == null || typeof a !== "object" || typeof b !== "object") {
          return `${path} — next=${JSON.stringify(a)?.slice(0, 200)} prev=${JSON.stringify(b)?.slice(0, 200)}`;
        }
        const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
        for (const k of keys) {
          const r = firstDiffPath(
            (a as Record<string, unknown>)[k],
            (b as Record<string, unknown>)[k],
            `${path}.${k}`,
          );
          if (r) return r;
        }
        return `${path} — types: next=${Array.isArray(a) ? "array" : typeof a} prev=${Array.isArray(b) ? "array" : typeof b}\n  next=${JSON.stringify(a)?.slice(0, 300)}\n  prev=${JSON.stringify(b)?.slice(0, 300)}`;
      };
      for (const k of Object.keys(nextCmp)) {
        if (!deepEqual(nextCmp[k], prevCmp[k])) {
          logger.warn(
            `[import][debug-diff] ${ctx.item.slug} champ "${k}" : ${firstDiffPath(nextCmp[k], prevCmp[k])}`,
          );
        }
      }
    }

    if (!dryRun) {
      try {
        await loose(payload).update({
          collection: "books",
          id: existing.id,
          data,
          context: MIGRATION_CONTEXT,
        });
      } catch (e) {
        recordFailure(ctx, e);
        continue;
      }
    }
    report.updated++;
    report.updatedList.push({ site: ctx.site, wpId: ctx.item.id, slug: ctx.item.slug });
  }

  logger.info(
    `[import] books : ${report.created} créé(s), ${report.updated} maj, ${report.unchanged} inchangé(s) (${dryRun ? "dry-run" : "écrit"}).`,
  );
  if (report.contentTouchedKeys.length > 0) {
    logger.warn(
      `[import] ${report.contentTouchedKeys.length} fiche(s) contentTouched=true détectée(s) (attendu : 0) : ` +
        report.contentTouchedKeys.map((k) => k.slug).join(", "),
    );
  }

  return report;
}

/* ─────────────────────────── Balayage des suppressions ─────────────────────────── */

export interface SweepResult {
  drafted: { site: Site; wpId: number; slug: string }[];
}

/**
 * Tout book existant, d'origine WordPress, dont `(wpSource.site, wpSource.wpId)`
 * n'apparaît plus dans la capture de ce run → passage en `draft` (jamais de
 * suppression). Scope limité aux sites effectivement traités par ce run — on
 * ne peut pas juger de l'absence d'une fiche d'un site qu'on n'a pas capturé.
 */
export async function sweepMissing(
  payload: Payload,
  sites: Site[],
  capturedKeys: Set<string>,
  logger: Logger,
  dryRun: boolean,
): Promise<SweepResult> {
  const editions = sites.map((s) => EDITION_BY_SITE[s]);
  const res = await loose(payload).find({
    collection: "books",
    where: { "wpSource.site": { in: editions } },
    limit: 0,
    depth: 0,
    draft: true,
  });

  // Garde anti-dépublication massive : si la capture couvre nettement moins de
  // fiches que la base n'en connaît pour ces sites (collecte tronquée passée
  // entre les mailles), on refuse de balayer — quelques suppressions réelles
  // entre deux runs sont normales, une chute >10 % ne l'est pas.
  const knownForSites = res.docs.filter((d) => {
    const wp = d.wpSource as { site?: string; wpId?: number } | undefined;
    return wp?.site != null && wp.wpId != null;
  }).length;
  if (knownForSites > 0 && capturedKeys.size < knownForSites * 0.9) {
    throw new Error(
      `[sweep] capture (${capturedKeys.size}) < 90 % des fiches connues en base pour ces sites (${knownForSites}) — balayage refusé, collecte suspecte.`,
    );
  }

  const drafted: SweepResult["drafted"] = [];
  for (const doc of res.docs) {
    const wpSource = doc.wpSource as { site?: EditionSlug; wpId?: number } | undefined;
    if (!wpSource?.site || wpSource.wpId == null) continue;
    const key = wpSourceKey(wpSource.site, wpSource.wpId);
    if (capturedKeys.has(key)) continue;
    if (doc._status === "draft") continue; // déjà à l'écart, rien à faire

    const site = (Object.keys(EDITION_BY_SITE) as Site[]).find((s) => EDITION_BY_SITE[s] === wpSource.site)!;
    drafted.push({ site, wpId: wpSource.wpId, slug: String(doc.slug) });
    if (!dryRun) {
      await loose(payload).update({
        collection: "books",
        id: doc.id,
        data: { _status: "draft" },
        context: MIGRATION_CONTEXT,
      });
    }
  }

  if (drafted.length > 0) {
    logger.warn(
      `[import] ${drafted.length} fiche(s) disparue(s) de la capture → passées en draft : ` +
        drafted.map((d) => d.slug).join(", "),
    );
  } else {
    logger.info(`[import] balayage des suppressions : aucune fiche à mettre en draft.`);
  }
  return { drafted };
}
