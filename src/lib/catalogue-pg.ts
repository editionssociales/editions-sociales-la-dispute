import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";
import { payloadBookToRawBook } from "./catalogue-pg-map";
import {
  PUBLIC_BOOKS_READ,
  publicBooksWhere,
  type CatalogueSource,
  type RawBook,
} from "./catalogue-source";
import type { EditionSlug } from "./types";

/**
 * Adaptateur Postgres du port `CatalogueSource` — lit le back-office Payload
 * via la Local API, connexion **poolée** (`DATABASE_URL`, implicite :
 * `payload.config.ts` ne configure que celle-ci) indispensable au build SSG
 * qui pré-rend ~295 fiches en parallèle sans épuiser les connexions Neon.
 * Seule source du catalogue depuis la coupure OVH : la façade
 * (`catalogue.ts`) compose `listBooks`/`getBook` avec
 * `listBoutiqueOnlyBooks`/`getBoutiqueOnlyBook` ci-dessous via
 * `buildNativeCatalogue`/`buildNativeBookDetail` (`catalogue-core.ts`).
 *
 * `getPayload({ config })` est mémoïsé par Payload lui-même (singleton par
 * process) — pas besoin d'un `cache()` React ici.
 */

async function listBooks(edition: EditionSlug): Promise<RawBook[]> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "books",
    where: publicBooksWhere(edition),
    // Contrat anti-brouillon (cf. finding sécurité E4), défini une seule fois
    // dans `catalogue-source.ts:PUBLIC_BOOKS_READ` et partagé avec
    // `compare-sources.ts` — jamais un brouillon servi au public.
    ...PUBLIC_BOOKS_READ,
    depth: 2,
    // Clé de tri du port : `sortDate` (non-nul, cf. `Books.ts`) — jamais
    // `wpSource.wpDate`, qui placerait en tête les fiches nées dans Payload
    // (NULL en `ORDER BY … DESC` Postgres), piège corrigé par le plan (E4).
    sort: "-sortDate",
    // Pas de pagination : le port renvoie tout le fonds (parité avec
    // l'adaptateur http, qui parcourt ses propres pages en interne).
    limit: 0,
  });
  return docs.map(payloadBookToRawBook);
}

async function getBook(edition: EditionSlug, slug: string): Promise<RawBook | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "books",
    where: { ...publicBooksWhere(edition), slug: { equals: slug } },
    // cf. `listBooks` : sans ça, une fiche jamais publiée serait servie (et
    // pré-générée en page statique via `generateStaticParams`).
    ...PUBLIC_BOOKS_READ,
    depth: 2,
    limit: 1,
  });
  const doc = docs[0];
  return doc ? payloadBookToRawBook(doc) : null;
}

export function pgCatalogueSource(): CatalogueSource {
  return {
    listBooks,
    getBook,
  };
}

/**
 * Tous les articles boutique-seuls (`origin: "boutique"`, `edition: null` —
 * goodies, manuels, correspondances). Fournit la grille `/boutique` (plan §4
 * étape 7) et les extras de `buildNativeCatalogue`.
 */
export async function listBoutiqueOnlyBooks(): Promise<RawBook[]> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "books",
    where: { origin: { equals: "boutique" } },
    // cf. `listBooks` : ne sert jamais un brouillon au public.
    ...PUBLIC_BOOKS_READ,
    depth: 2,
    sort: "-sortDate",
    limit: 0,
  });
  return docs.map(payloadBookToRawBook);
}

/** Fiche d'un article boutique-seul par slug (`/boutique/[slug]`, plan §4 étape 7) — `null` si absent. */
export async function getBoutiqueOnlyBook(slug: string): Promise<RawBook | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "books",
    where: { origin: { equals: "boutique" }, slug: { equals: slug } },
    ...PUBLIC_BOOKS_READ,
    depth: 2,
    limit: 1,
  });
  const doc = docs[0];
  return doc ? payloadBookToRawBook(doc) : null;
}
