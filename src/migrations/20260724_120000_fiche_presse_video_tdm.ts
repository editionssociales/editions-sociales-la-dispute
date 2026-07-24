import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Onglets de la fiche livre (maquette client « essai page de livre »,
 * 2026-07-23) : array `presse` (citation/source/date/lien), champ `video`
 * (URL YouTube) et richText `tableMatieres` sur `books` — plus leurs mirroirs
 * de versions (`drafts: true`) : colonnes `version_*` sur `_books_v` et table
 * d'array `_books_v_version_presse` (id serial + `_uuid`, convention Payload
 * pour les arrays sous collection versionnée). Colonnes nullable partout
 * (drafts). Migration écrite à la main comme les précédentes (les snapshots
 * drizzle du repo ne permettent plus `migrate:create`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "payload"."books_presse" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"citation" varchar,
  	"source" varchar,
  	"date" varchar,
  	"lien" varchar
  );

  ALTER TABLE "payload"."books_presse" ADD CONSTRAINT "books_presse_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."books"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "books_presse_order_idx" ON "payload"."books_presse" USING btree ("_order");
  CREATE INDEX "books_presse_parent_id_idx" ON "payload"."books_presse" USING btree ("_parent_id");

  CREATE TABLE "payload"."_books_v_version_presse" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"citation" varchar,
  	"source" varchar,
  	"date" varchar,
  	"lien" varchar,
  	"_uuid" varchar
  );

  ALTER TABLE "payload"."_books_v_version_presse" ADD CONSTRAINT "_books_v_version_presse_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_books_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "_books_v_version_presse_order_idx" ON "payload"."_books_v_version_presse" USING btree ("_order");
  CREATE INDEX "_books_v_version_presse_parent_id_idx" ON "payload"."_books_v_version_presse" USING btree ("_parent_id");

  ALTER TABLE "payload"."books" ADD COLUMN "video" varchar;
  ALTER TABLE "payload"."books" ADD COLUMN "table_matieres" jsonb;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_video" varchar;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_table_matieres" jsonb;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE "payload"."books_presse" CASCADE;
  DROP TABLE "payload"."_books_v_version_presse" CASCADE;
  ALTER TABLE "payload"."books" DROP COLUMN IF EXISTS "video";
  ALTER TABLE "payload"."books" DROP COLUMN IF EXISTS "table_matieres";
  ALTER TABLE "payload"."_books_v" DROP COLUMN IF EXISTS "version_video";
  ALTER TABLE "payload"."_books_v" DROP COLUMN IF EXISTS "version_table_matieres";
  `)
}
