import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { seedProduitsContreparties } from './20260821_160000_produits_contreparties'

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
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "payload"."enum_orders_shipping_method" ADD VALUE IF NOT EXISTS 'lot';

  ALTER TABLE "payload"."books" ADD COLUMN "commerce_vente_par_lot" boolean DEFAULT false;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_commerce_vente_par_lot" boolean DEFAULT false;
  `)
  // Base VIERGE seulement (CI, Postgres jetable, nouvel environnement) :
  // `20260821_160000` s'y est effacée faute de cette colonne, on rejoue donc
  // son semis ici. Sur une base déjà peuplée (prod), ce semis a eu lieu en son
  // temps : on ne réécrit RIEN — une fiche retirée depuis par l'équipe ne doit
  // pas réapparaître à l'occasion d'un déploiement. La prochaine migration qui
  // ajoutera une colonne à `books` devra reprendre ce relais (même garde).
  const { rows } = await db.execute(sql`SELECT 1 FROM "payload"."books" LIMIT 1`)
  if (rows.length === 0) await seedProduitsContreparties({ payload, req })
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."books" DROP COLUMN IF EXISTS "commerce_vente_par_lot";
  ALTER TABLE "payload"."_books_v" DROP COLUMN IF EXISTS "version_commerce_vente_par_lot";
  `)
}
