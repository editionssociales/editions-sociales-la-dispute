import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { seedProduitsContreparties } from './20260821_160000_produits_contreparties'

/**
 * Livre masqué (client 2026-11) : `books.masque` (case `Books.ts:masque` —
 * hors de toutes les listes du site, fiche/URL/achat inchangés) et son
 * jumeau de version `_books_v.version_masque` (la collection a des
 * brouillons). Index sur `masque` : la liste admin et `isListed` filtrent
 * dessus.
 *
 * RELAIS du semis des contreparties (cf. `20260821_160000`) : la Local API
 * lit TOUTES les colonnes de la config courante, donc le semis ne peut
 * s'exécuter qu'APRÈS la dernière migration qui ajoute une colonne à `books`
 * — c'est celle-ci (il avait été posé sur `20261112_100000_vente_par_lot`, qui
 * ne le rejoue plus). Base VIERGE seulement : sur une base peuplée (prod) le
 * semis a eu lieu en son temps, on ne réécrit RIEN. La prochaine migration
 * qui ajoutera une colonne à `books` devra reprendre ce relais (même garde).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."books" ADD COLUMN IF NOT EXISTS "masque" boolean DEFAULT false;
  ALTER TABLE "payload"."_books_v" ADD COLUMN IF NOT EXISTS "version_masque" boolean DEFAULT false;
  CREATE INDEX IF NOT EXISTS "books_masque_idx" ON "payload"."books" USING btree ("masque");
  CREATE INDEX IF NOT EXISTS "_books_v_version_version_masque_idx" ON "payload"."_books_v" USING btree ("version_masque");
  `)
  const { rows } = await db.execute(sql`SELECT 1 FROM "payload"."books" LIMIT 1`)
  if (rows.length === 0) await seedProduitsContreparties({ payload, req })
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "payload"."books_masque_idx";
  DROP INDEX IF EXISTS "payload"."_books_v_version_version_masque_idx";
  ALTER TABLE "payload"."books" DROP COLUMN IF EXISTS "masque";
  ALTER TABLE "payload"."_books_v" DROP COLUMN IF EXISTS "version_masque";
  `)
}
