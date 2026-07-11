/**
 * Rapatriement des médias (couvertures, PDF table/extrait, uploads intégrés au
 * HTML) depuis la prod OVH vers Payload (Local API → Vercel Blob).
 *
 * Dédup par `sourceUrl` (index unique côté `media`) : c'est la clé
 * d'idempotence — un `sourceUrl` déjà connu n'est jamais retéléchargé.
 * En cas d'échec définitif : log + continue, jamais de throw (une fiche sans
 * couverture rapatriée garde `coverFallbackUrl`, cf. `import.ts`).
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Payload } from "payload";
import { fetchWithRetry, HttpError, type Logger, type Site } from "./utils.ts";

const TMP_DIR = path.join(process.cwd(), "scripts/migrate-catalogue/out/tmp");

export interface MediaResult {
  id: number | null;
  url: string | null;
  error?: string;
  /** `true` en `--dry-run` : dédup lu, mais aucun téléchargement/upload réel effectué. */
  skipped?: boolean;
}

export interface BookMediaInput {
  site: Site;
  wpId: number;
  title: string;
  /** URL déjà normalisée (les 3 formes tolérées de `book.cover` sont résolues en amont). */
  coverUrl: string | null;
  tableUrl: string | null;
  extraitUrl: string | null;
  contentHtml: string | null;
  plusLoinHtml: string | null;
}

export interface BookMediaResolution {
  coverMediaId: number | null;
  /** Renseigné seulement si le rapatriement de la couverture a échoué. */
  coverFallbackUrl: string | null;
  tablePdfId: number | null;
  extraitPdfId: number | null;
  /** `sourceUrl` (tel que trouvé littéralement dans le HTML) → URL Payload/Blob finale. */
  embeddedUrlMap: Map<string, string>;
  /**
   * URL Payload/Blob finale → id `media`. Sert à annoter les `<img>` du HTML
   * réécrit (`data-lexical-upload-id`) avant `convertHTMLToLexical` — sans id,
   * la conversion produit des upload nodes invalides et la fiche ne sauve pas.
   */
  embeddedIdByFinalUrl: Map<string, number>;
}

export interface MediaFailure {
  site: Site;
  wpId: number;
  kind: "cover" | "table" | "extrait" | "embedded";
  sourceUrl: string;
  error: string;
}

/* ─────────────────────────── Résolution couverture ─────────────────────────── */

/** 171/295 couvertures portent un suffixe `-WxH` : l'original est retrouvable en le retirant. */
function stripDimensionSuffix(url: string): string | null {
  const m = /^(.*)-\d+x\d+(\.\w+)$/.exec(url);
  return m ? `${m[1]}${m[2]}` : null;
}

async function urlOk(url: string): Promise<boolean> {
  try {
    const res = await fetchWithRetry(url, { method: "HEAD" }, { retries: 1, timeoutMs: 10_000 });
    if (res.ok) return true;
    if (res.status === 405 || res.status === 501) {
      // Certains hébergements OVH refusent HEAD sur du statique : repli GET.
      const res2 = await fetchWithRetry(url, { method: "GET" }, { retries: 1, timeoutMs: 10_000 });
      return res2.ok;
    }
    return false;
  } catch {
    return false;
  }
}

/** Retrouve l'original (strip `-WxH` + vérif 200) ; repli sur l'URL servie sinon. */
export async function resolveCoverSourceUrl(rawUrl: string): Promise<string> {
  const candidate = stripDimensionSuffix(rawUrl);
  if (!candidate) return rawUrl;
  return (await urlOk(candidate)) ? candidate : rawUrl;
}

/* ─────────────────────────── Uploads intégrés au HTML ─────────────────────────── */

const ABSOLUTE_UPLOAD_RE =
  /https?:\/\/[^\s"'()<>]+\/wp-content\/uploads\/\d{4}\/\d{2}\/[^"'\s)<>]+/g;
const RELATIVE_UPLOAD_RE = /\/?wp-content\/uploads\/\d{4}\/\d{2}\/[^"'\s)<>]+/g;

/**
 * Fermeture transitive des uploads référencés dans `content`/`plus_loin` :
 * fichiers exacts référencés, variantes `-WxH` comprises (fidélité maximale,
 * volume négligeable — R2 §1.5). Renvoie les URLs telles que trouvées
 * littéralement dans le HTML (clé de `rewrite-html.ts`).
 */
export function collectEmbeddedUploadUrls(html: string | null | undefined, siteBase: string): string[] {
  if (!html) return [];
  const found = new Set<string>();
  for (const m of html.matchAll(ABSOLUTE_UPLOAD_RE)) found.add(m[0]);
  for (const m of html.matchAll(RELATIVE_UPLOAD_RE)) {
    const already = [...found].some((u) => u.endsWith(m[0]) || u.endsWith(`/${m[0]}`));
    if (!already) {
      const rel = m[0].startsWith("/") ? m[0] : `/${m[0]}`;
      found.add(`${siteBase}${rel}`);
    }
  }
  return [...found];
}

/* ─────────────────────────── Téléchargement + upload Payload ─────────────────────────── */

let tmpCounter = 0;

function safeTmpName(url: string): string {
  tmpCounter++;
  let base: string;
  try {
    base = decodeURIComponent(path.basename(new URL(url).pathname));
  } catch {
    base = `media-${tmpCounter}`;
  }
  const safe = base.replace(/[^\w.\-]/g, "_") || `media-${tmpCounter}`;
  return `${Date.now()}-${tmpCounter}-${safe}`;
}

/** Un seul essai de téléchargement (brut, puis `encodeURI` en repli — accents/percent-encoding, R3 §6). */
async function downloadBinary(url: string): Promise<Buffer> {
  async function attempt(u: string): Promise<Buffer> {
    const res = await fetchWithRetry(u, {}, { retries: 2, timeoutMs: 20_000 });
    if (!res.ok) throw new HttpError(u, res.status);
    return Buffer.from(await res.arrayBuffer());
  }
  try {
    return await attempt(url);
  } catch (err) {
    const alt = encodeURI(url);
    if (alt === url) throw err;
    return attempt(alt);
  }
}

/** find-or-create par `sourceUrl` (dédup) ; upload réel seulement si absent. */
async function resolveOrUpload(
  payload: Payload,
  sourceUrl: string,
  alt: string,
  logger: Logger,
  dryRun: boolean,
): Promise<MediaResult> {
  // Note de typage : les collections (`media`, ...) ne sont pas encore générées
  // (`payload generate:types` dépend du scaffold E2) — on passe volontairement en
  // `any` sur les appels Local API plutôt que de figer un shape qui n'existe pas
  // encore côté schéma.
  const p = payload as unknown as {
    find: (args: unknown) => Promise<{ docs: { id: number; url?: string }[] }>;
    create: (args: unknown) => Promise<{ id: number; url?: string }>;
  };

  try {
    const existing = await p.find({
      collection: "media",
      where: { sourceUrl: { equals: sourceUrl } },
      limit: 1,
    });
    const found = existing.docs?.[0];
    if (found) return { id: found.id, url: found.url ?? null };
  } catch (err) {
    logger.warn(`[media] recherche de dédup échouée pour ${sourceUrl} : ${err instanceof Error ? err.message : err}`);
  }

  if (dryRun) {
    logger.info(`[media] dry-run : aurait téléchargé + créé un media pour ${sourceUrl}.`);
    return { id: null, url: null, skipped: true };
  }

  let filePath: string | null = null;
  try {
    const buffer = await downloadBinary(sourceUrl);
    await mkdir(TMP_DIR, { recursive: true });
    filePath = path.join(TMP_DIR, safeTmpName(sourceUrl));
    await writeFile(filePath, buffer);
    const created = await p.create({
      collection: "media",
      data: { alt, sourceUrl },
      filePath,
      context: { migration: true, disableRevalidate: true },
    });
    return { id: created.id, url: created.url ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[media] échec du rapatriement de ${sourceUrl} : ${message}`);
    return { id: null, url: null, error: message };
  } finally {
    if (filePath) await rm(filePath, { force: true }).catch(() => {});
  }
}

/** Résout tous les médias d'un lot de fiches (couverture, PDF, uploads intégrés). */
export async function resolveMediaForBooks(
  payload: Payload,
  books: BookMediaInput[],
  siteBase: Record<Site, string>,
  logger: Logger,
  dryRun: boolean,
): Promise<{ resolutions: Map<string, BookMediaResolution>; failures: MediaFailure[] }> {
  const out = new Map<string, BookMediaResolution>();
  const failures: MediaFailure[] = [];

  for (const book of books) {
    const key = `${book.site}:${book.wpId}`;
    const resolution: BookMediaResolution = {
      coverMediaId: null,
      coverFallbackUrl: null,
      tablePdfId: null,
      extraitPdfId: null,
      embeddedUrlMap: new Map(),
      embeddedIdByFinalUrl: new Map(),
    };

    if (book.coverUrl) {
      const resolvedCoverUrl = await resolveCoverSourceUrl(book.coverUrl);
      const res = await resolveOrUpload(payload, resolvedCoverUrl, `Couverture — ${book.title}`, logger, dryRun);
      if (res.id != null) resolution.coverMediaId = res.id;
      else {
        resolution.coverFallbackUrl = book.coverUrl;
        if (!res.skipped) {
          failures.push({
            site: book.site,
            wpId: book.wpId,
            kind: "cover",
            sourceUrl: resolvedCoverUrl,
            error: res.error ?? "échec inconnu",
          });
        }
      }
    }

    if (book.tableUrl) {
      const res = await resolveOrUpload(payload, book.tableUrl, `Table des matières — ${book.title}`, logger, dryRun);
      resolution.tablePdfId = res.id;
      if (res.id == null && !res.skipped) {
        failures.push({
          site: book.site,
          wpId: book.wpId,
          kind: "table",
          sourceUrl: book.tableUrl,
          error: res.error ?? "échec inconnu",
        });
      }
    }

    if (book.extraitUrl) {
      const res = await resolveOrUpload(payload, book.extraitUrl, `Extrait — ${book.title}`, logger, dryRun);
      resolution.extraitPdfId = res.id;
      if (res.id == null && !res.skipped) {
        failures.push({
          site: book.site,
          wpId: book.wpId,
          kind: "extrait",
          sourceUrl: book.extraitUrl,
          error: res.error ?? "échec inconnu",
        });
      }
    }

    const embedded = new Set([
      ...collectEmbeddedUploadUrls(book.contentHtml, siteBase[book.site]),
      ...collectEmbeddedUploadUrls(book.plusLoinHtml, siteBase[book.site]),
    ]);
    for (const url of embedded) {
      const res = await resolveOrUpload(payload, url, `Média — ${book.title}`, logger, dryRun);
      if (res.url) resolution.embeddedUrlMap.set(url, res.url);
      if (res.url && res.id != null) resolution.embeddedIdByFinalUrl.set(res.url, res.id);
      else if (!res.skipped) {
        failures.push({
          site: book.site,
          wpId: book.wpId,
          kind: "embedded",
          sourceUrl: url,
          error: res.error ?? "échec inconnu",
        });
      }
    }

    out.set(key, resolution);
  }

  logger.info(
    `[media] ${books.length} fiche(s) traitée(s), ${failures.length} média(s) en échec (fiche conservée, repli légitime).`,
  );
  return { resolutions: out, failures };
}
