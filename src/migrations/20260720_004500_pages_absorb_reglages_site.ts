import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Absorbe `reglages-site` (pied de page, réseaux, SEO) dans `pages-legales`
 * (admin « Pages ») — copie les données puis supprime l'ancien global.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."pages_legales"
    ADD COLUMN IF NOT EXISTS "footer_adresse" varchar,
    ADD COLUMN IF NOT EXISTS "footer_texte_diffusion" varchar,
    ADD COLUMN IF NOT EXISTS "seo_titre_par_defaut" varchar,
    ADD COLUMN IF NOT EXISTS "seo_description_par_defaut" varchar;

  CREATE TABLE IF NOT EXISTS "payload"."pages_legales_reseaux_sociaux" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );

  DO $$ BEGIN
    ALTER TABLE "payload"."pages_legales_reseaux_sociaux"
      ADD CONSTRAINT "pages_legales_reseaux_sociaux_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_legales"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;

  CREATE INDEX IF NOT EXISTS "pages_legales_reseaux_sociaux_order_idx"
    ON "payload"."pages_legales_reseaux_sociaux" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_legales_reseaux_sociaux_parent_id_idx"
    ON "payload"."pages_legales_reseaux_sociaux" USING btree ("_parent_id");

  INSERT INTO "payload"."pages_legales" ("updated_at", "created_at")
  SELECT now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "payload"."pages_legales");

  UPDATE "payload"."pages_legales" AS pl
  SET
    "footer_adresse" = rs."footer_adresse",
    "footer_texte_diffusion" = rs."footer_texte_diffusion",
    "seo_titre_par_defaut" = rs."seo_titre_par_defaut",
    "seo_description_par_defaut" = rs."seo_description_par_defaut"
  FROM "payload"."reglages_site" AS rs
  WHERE pl."id" = (SELECT "id" FROM "payload"."pages_legales" ORDER BY "id" ASC LIMIT 1);

  INSERT INTO "payload"."pages_legales_reseaux_sociaux" ("_order", "_parent_id", "id", "label", "url")
  SELECT
    rs."_order",
    (SELECT "id" FROM "payload"."pages_legales" ORDER BY "id" ASC LIMIT 1),
    'pl-' || rs."id",
    rs."label",
    rs."url"
  FROM "payload"."reglages_site_reseaux_sociaux" AS rs
  WHERE NOT EXISTS (
    SELECT 1 FROM "payload"."pages_legales_reseaux_sociaux" AS dest
    WHERE dest."id" = 'pl-' || rs."id"
  );

  DROP TABLE IF EXISTS "payload"."reglages_site_reseaux_sociaux" CASCADE;
  DROP TABLE IF EXISTS "payload"."reglages_site" CASCADE;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "payload"."reglages_site" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"footer_adresse" varchar,
  	"footer_texte_diffusion" varchar,
  	"seo_titre_par_defaut" varchar,
  	"seo_description_par_defaut" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  CREATE TABLE IF NOT EXISTS "payload"."reglages_site_reseaux_sociaux" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );

  DO $$ BEGIN
    ALTER TABLE "payload"."reglages_site_reseaux_sociaux"
      ADD CONSTRAINT "reglages_site_reseaux_sociaux_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "payload"."reglages_site"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;

  CREATE INDEX IF NOT EXISTS "reglages_site_reseaux_sociaux_order_idx"
    ON "payload"."reglages_site_reseaux_sociaux" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "reglages_site_reseaux_sociaux_parent_id_idx"
    ON "payload"."reglages_site_reseaux_sociaux" USING btree ("_parent_id");

  INSERT INTO "payload"."reglages_site" (
    "footer_adresse",
    "footer_texte_diffusion",
    "seo_titre_par_defaut",
    "seo_description_par_defaut",
    "updated_at",
    "created_at"
  )
  SELECT
    pl."footer_adresse",
    pl."footer_texte_diffusion",
    pl."seo_titre_par_defaut",
    pl."seo_description_par_defaut",
    pl."updated_at",
    pl."created_at"
  FROM "payload"."pages_legales" AS pl
  ORDER BY pl."id" ASC
  LIMIT 1;

  INSERT INTO "payload"."reglages_site_reseaux_sociaux" ("_order", "_parent_id", "id", "label", "url")
  SELECT
    pr."_order",
    (SELECT "id" FROM "payload"."reglages_site" ORDER BY "id" ASC LIMIT 1),
    CASE
      WHEN pr."id" LIKE 'pl-%' THEN substring(pr."id" from 4)
      ELSE pr."id"
    END,
    pr."label",
    pr."url"
  FROM "payload"."pages_legales_reseaux_sociaux" AS pr;

  DROP TABLE IF EXISTS "payload"."pages_legales_reseaux_sociaux" CASCADE;
  ALTER TABLE "payload"."pages_legales"
    DROP COLUMN IF EXISTS "footer_adresse",
    DROP COLUMN IF EXISTS "footer_texte_diffusion",
    DROP COLUMN IF EXISTS "seo_titre_par_defaut",
    DROP COLUMN IF EXISTS "seo_description_par_defaut";
  `)
}
