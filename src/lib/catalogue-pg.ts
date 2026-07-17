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
 * Adaptateur Postgres du port `CatalogueSource` (E4 du plan) — lit le
 * back-office Payload via la Local API, connexion **poolée** (`DATABASE_URL`,
 * implicite : `payload.config.ts` ne configure que celle-ci) indispensable au
 * build SSG qui pré-rend ~295 fiches en parallèle sans épuiser les connexions
 * Neon. Sélectionné par `CATALOGUE_SOURCE=pg` (`catalogue.ts`). Ce port ne
 * porte plus les produits boutique : la façade (`catalogue.ts`) appelle
 * directement `getAllStoreProducts()` (`boutique.ts`, Woo reste la source de
 * vérité des ventes tant que `COMMERCE_NATIVE=0`, quel que soit
 * `CATALOGUE_SOURCE` — le flag qui gouverne les VENTES est distinct de celui
 * qui gouverne le contenu du catalogue, plan §4 étape 2c). L'ANGLE MORT n°2
 * du plan (des `permalink` d'achat qui resteraient WooCommerce après le
 * passage au commerce natif) est refermé par `listBoutiqueOnlyBooks`/
 * `getBoutiqueOnlyBook` ci-dessous : à `COMMERCE_NATIVE=1`, `catalogue.ts`
 * n'appelle plus `getAllStoreProducts()` du tout — il compose directement
 * `listBooks`/`getBook` (contenu, quelle que soit sa source) avec ces deux
 * fonctions (ventes, Payload uniquement) via `buildNativeCatalogue`/
 * `buildNativeBookDetail` (`catalogue-core.ts`).
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
 * goodies, manuels, produits WooCommerce jamais réclamés par une fiche,
 * `scripts/migrate-products.ts`). Fournit la grille `/boutique` (plan §4
 * étape 7) et les extras de `buildNativeCatalogue` — appelée uniquement à
 * `COMMERCE_NATIVE=1`, quel que soit `CATALOGUE_SOURCE` (ces articles n'ont
 * jamais existé côté WordPress).
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
