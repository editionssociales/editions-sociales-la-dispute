import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Commandes de lots (client 2026-11, demandes 2 et 3) :
 *
 * 1. `orders.vente_par_lot` (+ index) — drapeau posé au webhook quand une
 *    ligne de la commande est une fiche « vendue par lot » (chip « Lots » du
 *    back-office, mail dédié). Pas un `order_type` : l'idempotence
 *    `(stripe_session_id, order_type)` reste intacte.
 * 2. Global `mail-commande-lot` (texte du mail propre aux commandes de lots) :
 *    table du global + table `_rels` de la relation `hasMany` vers `books`
 *    (même forme que `books_rels` de la migration initiale ; un global n'a
 *    pas de `payload_locked_documents_rels`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."orders" ADD COLUMN "vente_par_lot" boolean DEFAULT false;
  CREATE INDEX "orders_vente_par_lot_idx" ON "payload"."orders" USING btree ("vente_par_lot");

  CREATE TABLE "payload"."mail_commande_lot" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"objet" varchar,
  	"message" varchar,
  	"recommandations_titre" varchar DEFAULT 'Nos recommandations de lecture',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."mail_commande_lot_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"books_id" integer
  );
  ALTER TABLE "payload"."mail_commande_lot_rels" ADD CONSTRAINT "mail_commande_lot_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."mail_commande_lot"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."mail_commande_lot_rels" ADD CONSTRAINT "mail_commande_lot_rels_books_fk" FOREIGN KEY ("books_id") REFERENCES "payload"."books"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "mail_commande_lot_rels_order_idx" ON "payload"."mail_commande_lot_rels" USING btree ("order");
  CREATE INDEX "mail_commande_lot_rels_parent_idx" ON "payload"."mail_commande_lot_rels" USING btree ("parent_id");
  CREATE INDEX "mail_commande_lot_rels_path_idx" ON "payload"."mail_commande_lot_rels" USING btree ("path");
  CREATE INDEX "mail_commande_lot_rels_books_id_idx" ON "payload"."mail_commande_lot_rels" USING btree ("books_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "payload"."mail_commande_lot_rels" CASCADE;
  DROP TABLE IF EXISTS "payload"."mail_commande_lot" CASCADE;
  DROP INDEX IF EXISTS "payload"."orders_vente_par_lot_idx";
  ALTER TABLE "payload"."orders" DROP COLUMN IF EXISTS "vente_par_lot";
  `)
}
