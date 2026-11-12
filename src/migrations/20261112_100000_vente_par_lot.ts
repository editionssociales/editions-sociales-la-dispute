import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Vente par lot (client 2026-11) : `books.commerce_vente_par_lot` (case
 * `Books.ts:commerce.venteParLot`, port forfaitaire 10 € / offert dès 2 lots)
 * et son jumeau de version `_books_v.version_commerce_vente_par_lot`
 * (même patron que `commerce_reduced_shipping_flag`, `20260712_164840_commerce`),
 * plus la valeur `lot` de `orders.shipping_method`.
 *
 * Même limite qu'`aucun` (`20260909_110000_commande_sans_envoi`) : Postgres ne
 * retire pas une valeur d'enum, le `down` laisse donc le type intact.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "payload"."enum_orders_shipping_method" ADD VALUE IF NOT EXISTS 'lot';

  ALTER TABLE "payload"."books" ADD COLUMN "commerce_vente_par_lot" boolean DEFAULT false;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_commerce_vente_par_lot" boolean DEFAULT false;
  `)
  // Le semis des contreparties sur base vierge n'est PLUS rejoué ici : la
  // config courante connaît des colonnes de `books` ajoutées par des migrations
  // postérieures, la Local API échouerait. Il est porté par la dernière
  // migration qui ajoute une colonne à `books` (`20261113_090000_livre_masque`).
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."books" DROP COLUMN IF EXISTS "commerce_vente_par_lot";
  ALTER TABLE "payload"."_books_v" DROP COLUMN IF EXISTS "version_commerce_vente_par_lot";
  `)
}
