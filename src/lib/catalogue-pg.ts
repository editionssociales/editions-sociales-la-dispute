import "server-only";
import config from "@payload-config";
import { getPayload } from "payload";
import { getAllStoreProducts } from "./boutique";
import { payloadBookToRawBook } from "./catalogue-pg-map";
import type { CatalogueSource, RawBook } from "./catalogue-source";
import type { EditionSlug } from "./types";

/**
 * Adaptateur Postgres du port `CatalogueSource` (E4 du plan) — lit le
 * back-office Payload via la Local API, connexion **poolée** (`DATABASE_URL`,
 * implicite : `payload.config.ts` ne configure que celle-ci) indispensable au
 * build SSG qui pré-rend ~295 fiches en parallèle sans épuiser les connexions
 * Neon. Sélectionné par `CATALOGUE_SOURCE=pg` (`catalogue.ts`) ; `listProducts`
 * délègue, inchangé, à `boutique.ts` (angle mort n°2 du plan : les
 * `permalink` d'achat restent WooCommerce jusqu'à la phase commerce).
 *
 * `getPayload({ config })` est mémoïsé par Payload lui-même (singleton par
 * process) — pas besoin d'un `cache()` React ici en plus de celui déjà posé
 * sur `getAllStoreProducts`.
 */

async function listBooks(edition: EditionSlug): Promise<RawBook[]> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "books",
    where: { edition: { equals: edition } },
    draft: false,
    // Sans utilisateur (lecture front public), la policy `read` de `Books.ts`
    // ne laisse passer que `_status: 'published'` — `draft: false` choisit
    // seulement la branche de requête (pas de `queryDrafts()`), il ne filtre
    // PAS par statut à lui seul : `overrideAccess: false` est indispensable
    // pour ne jamais servir un brouillon au public (cf. finding sécurité E4).
    overrideAccess: false,
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
    where: { edition: { equals: edition }, slug: { equals: slug } },
    draft: false,
    // cf. `listBooks` : sans ça, une fiche jamais publiée serait servie (et
    // pré-générée en page statique via `generateStaticParams`).
    overrideAccess: false,
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
    listProducts: () => getAllStoreProducts(),
  };
}
