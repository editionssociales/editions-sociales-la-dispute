import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Global `page-nos-maisons` (page /nos-maisons, remplace la cellule « La
 * GEME » de la nav) : table principale + une table par tableau (`videos`,
 * `articles`). Aucune donnée existante touchée ; `down` supprime les trois
 * tables.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "payload"."page_nos_maisons_videos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"media" varchar,
  	"date" varchar
  );

  CREATE TABLE "payload"."page_nos_maisons_articles" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"media" varchar,
  	"date" varchar
  );

  CREATE TABLE "payload"."page_nos_maisons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titre" varchar,
  	"texte" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  ALTER TABLE "payload"."page_nos_maisons_videos" ADD CONSTRAINT "page_nos_maisons_videos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_nos_maisons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_nos_maisons_articles" ADD CONSTRAINT "page_nos_maisons_articles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_nos_maisons"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "page_nos_maisons_videos_order_idx" ON "payload"."page_nos_maisons_videos" USING btree ("_order");
  CREATE INDEX "page_nos_maisons_videos_parent_id_idx" ON "payload"."page_nos_maisons_videos" USING btree ("_parent_id");
  CREATE INDEX "page_nos_maisons_articles_order_idx" ON "payload"."page_nos_maisons_articles" USING btree ("_order");
  CREATE INDEX "page_nos_maisons_articles_parent_id_idx" ON "payload"."page_nos_maisons_articles" USING btree ("_parent_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_videos" CASCADE;
  DROP TABLE IF EXISTS "payload"."page_nos_maisons_articles" CASCADE;
  DROP TABLE IF EXISTS "payload"."page_nos_maisons" CASCADE;
  `)
}
