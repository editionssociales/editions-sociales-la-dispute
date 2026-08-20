import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Précommande (client 2026-08-20) — deux ajouts de schéma indépendants :
 *
 * 1. `books.commerce_preorder` (+ version) : flag opt-in par fiche
 *    (« Ouvert à la précommande »), défaut `false` — aucun livre existant
 *    ne devient précommandable par cette migration.
 * 2. `orders.order_type` (`commande`|`precommande`, défaut `commande`) : un
 *    panier mixte scinde désormais en DEUX Orders pour UNE session Stripe —
 *    la clé d'idempotence du webhook n'est donc plus `stripe_session_id`
 *    seul mais le couple `(stripe_session_id, order_type)`. Toutes les
 *    commandes déjà en base sont forcément `commande` (aucune précommande
 *    n'existait avant ce déploiement) : le défaut suffit au backfill,
 *    aucun `UPDATE` nécessaire.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."books" ADD COLUMN "commerce_preorder" boolean DEFAULT false;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_commerce_preorder" boolean DEFAULT false;

  CREATE TYPE "payload"."enum_orders_order_type" AS ENUM('commande', 'precommande');
  ALTER TABLE "payload"."orders" ADD COLUMN "order_type" "payload"."enum_orders_order_type" DEFAULT 'commande' NOT NULL;
  CREATE INDEX "orders_order_type_idx" ON "payload"."orders" USING btree ("order_type");

  DROP INDEX "payload"."orders_stripe_session_id_idx";
  CREATE INDEX "orders_stripe_session_id_idx" ON "payload"."orders" USING btree ("stripe_session_id");
  CREATE UNIQUE INDEX "orders_stripe_session_id_order_type_idx" ON "payload"."orders" USING btree ("stripe_session_id","order_type");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX "payload"."orders_stripe_session_id_order_type_idx";
  DROP INDEX "payload"."orders_stripe_session_id_idx";
  CREATE UNIQUE INDEX "orders_stripe_session_id_idx" ON "payload"."orders" USING btree ("stripe_session_id");

  DROP INDEX "payload"."orders_order_type_idx";
  ALTER TABLE "payload"."orders" DROP COLUMN "order_type";
  DROP TYPE "payload"."enum_orders_order_type";

  ALTER TABLE "payload"."books" DROP COLUMN "commerce_preorder";
  ALTER TABLE "payload"."_books_v" DROP COLUMN "version_commerce_preorder";
  `)
}
