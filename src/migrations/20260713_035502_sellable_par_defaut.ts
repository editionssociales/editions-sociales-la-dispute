import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Vendabilité par défaut (décision client relayée le 13/07 : « tout ce qui
 * est sur le site est vendable, stock en suivi manuel comme les goodies ») :
 * le défaut de `commerce.sellable` passe à true, et l'existant est backfillé
 * (87 fiches publiées restées à false parce que `migrate-products` ne posait
 * `sellable: true` que sur les fiches appariées à un produit Woo).
 *
 * NOTE : le snapshot .json de cette migration répare aussi la chaîne de
 * snapshots — celui de `20260712_203246_order_status_failed` avait perdu les
 * colonnes/enums `stock_suivi` (générés par `20260712_164840_commerce`), ce
 * qui faisait re-générer leur création par tout `migrate:create` suivant
 * (crash assuré au déploiement sur CREATE TYPE existant). Les statements
 * redondants ont été retirés du .ts à la main ; seul le snapshot complet
 * fait foi pour les diffs futurs.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."books" ALTER COLUMN "commerce_sellable" SET DEFAULT true;
  ALTER TABLE "payload"."_books_v" ALTER COLUMN "version_commerce_sellable" SET DEFAULT true;
  UPDATE "payload"."books" SET "commerce_sellable" = true WHERE "commerce_sellable" IS NOT TRUE;
  UPDATE "payload"."_books_v" SET "version_commerce_sellable" = true WHERE "latest" = true AND "version_commerce_sellable" IS NOT TRUE;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Ne rétablit que le DÉFAUT — le backfill n'est pas réversible (l'état
  // antérieur « quelles fiches étaient cochées » n'est pas mémorisé).
  await db.execute(sql`
   ALTER TABLE "payload"."books" ALTER COLUMN "commerce_sellable" SET DEFAULT false;
  ALTER TABLE "payload"."_books_v" ALTER COLUMN "version_commerce_sellable" SET DEFAULT false;`)
}
