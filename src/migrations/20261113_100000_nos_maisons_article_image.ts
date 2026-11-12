import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Page /nos-maisons : titres de section FACULTATIFS (`titre_videos`,
 * `titre_articles`, `titre_maisons` — vides par défaut, aucune section n'a de
 * titre sauf saisie) ET image de couverture facultative d'un article
 * (`PageNosMaisons.ts:articles.image`, upload vers `media`) : colonne
 * `image_id` + clé étrangère (`ON DELETE set null` : retirer un média ne
 * casse pas la page, l'article perd seulement son image) + index. Aucune
 * donnée existante touchée.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."page_nos_maisons" ADD COLUMN IF NOT EXISTS "titre_videos" varchar;
  ALTER TABLE "payload"."page_nos_maisons" ADD COLUMN IF NOT EXISTS "titre_articles" varchar;
  ALTER TABLE "payload"."page_nos_maisons" ADD COLUMN IF NOT EXISTS "titre_maisons" varchar;
  ALTER TABLE "payload"."page_nos_maisons_articles" ADD COLUMN IF NOT EXISTS "image_id" integer;
  DO $$ BEGIN
    ALTER TABLE "payload"."page_nos_maisons_articles" ADD CONSTRAINT "page_nos_maisons_articles_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "page_nos_maisons_articles_image_idx" ON "payload"."page_nos_maisons_articles" USING btree ("image_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."page_nos_maisons" DROP COLUMN IF EXISTS "titre_videos";
  ALTER TABLE "payload"."page_nos_maisons" DROP COLUMN IF EXISTS "titre_articles";
  ALTER TABLE "payload"."page_nos_maisons" DROP COLUMN IF EXISTS "titre_maisons";
  DROP INDEX IF EXISTS "payload"."page_nos_maisons_articles_image_idx";
  ALTER TABLE "payload"."page_nos_maisons_articles" DROP CONSTRAINT IF EXISTS "page_nos_maisons_articles_image_id_media_id_fk";
  ALTER TABLE "payload"."page_nos_maisons_articles" DROP COLUMN IF EXISTS "image_id";
  `)
}
