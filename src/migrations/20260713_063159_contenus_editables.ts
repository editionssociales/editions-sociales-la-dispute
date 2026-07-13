import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_page_a_propos_maisons_maison" AS ENUM('editions-sociales', 'la-dispute');
  CREATE TYPE "payload"."enum_page_souscription_contreparties_tier_id" AS ENUM('palier-15', 'palier-35', 'palier-50', 'palier-75', 'palier-100', 'palier-150', 'palier-200', 'palier-300');
  CREATE TYPE "payload"."enum_page_souscription_mecenes_tier_id" AS ENUM('mecene-500', 'mecene-1000');
  CREATE TABLE "payload"."pages_legales" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"cgv" jsonb,
  	"mentions_legales" jsonb,
  	"confidentialite" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."reglages_site_reseaux_sociaux" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."reglages_site" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"footer_adresse" varchar,
  	"footer_texte_diffusion" varchar,
  	"seo_titre_par_defaut" varchar,
  	"seo_description_par_defaut" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."page_a_propos_maisons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"maison" "payload"."enum_page_a_propos_maisons_maison" NOT NULL,
  	"nom" varchar,
  	"tagline" varchar,
  	"description" varchar
  );
  
  CREATE TABLE "payload"."page_a_propos_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"contenu" jsonb
  );
  
  CREATE TABLE "payload"."page_a_propos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"heros_titre" varchar,
  	"heros_intro" varchar,
  	"citation_texte" varchar,
  	"citation_attribution" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."page_souscription_chantiers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"desc" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."page_souscription_contreparties_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"texte" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."page_souscription_contreparties" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tier_id" "payload"."enum_page_souscription_contreparties_tier_id" NOT NULL,
  	"soutiens2024" numeric NOT NULL,
  	"populaire" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."page_souscription_mecenes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tier_id" "payload"."enum_page_souscription_mecenes_tier_id" NOT NULL,
  	"desc" varchar NOT NULL,
  	"soutiens2024" numeric NOT NULL
  );
  
  CREATE TABLE "payload"."page_souscription_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"reponse" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."page_souscription" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"heros_titre" varchar,
  	"heros_intro" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."reglages_site_reseaux_sociaux" ADD CONSTRAINT "reglages_site_reseaux_sociaux_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reglages_site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_a_propos_maisons" ADD CONSTRAINT "page_a_propos_maisons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_a_propos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_a_propos_sections" ADD CONSTRAINT "page_a_propos_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_a_propos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_souscription_chantiers" ADD CONSTRAINT "page_souscription_chantiers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_souscription"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_souscription_contreparties_items" ADD CONSTRAINT "page_souscription_contreparties_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_souscription_contreparties"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_souscription_contreparties" ADD CONSTRAINT "page_souscription_contreparties_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_souscription"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_souscription_mecenes" ADD CONSTRAINT "page_souscription_mecenes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_souscription"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_souscription_faq" ADD CONSTRAINT "page_souscription_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_souscription"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "reglages_site_reseaux_sociaux_order_idx" ON "payload"."reglages_site_reseaux_sociaux" USING btree ("_order");
  CREATE INDEX "reglages_site_reseaux_sociaux_parent_id_idx" ON "payload"."reglages_site_reseaux_sociaux" USING btree ("_parent_id");
  CREATE INDEX "page_a_propos_maisons_order_idx" ON "payload"."page_a_propos_maisons" USING btree ("_order");
  CREATE INDEX "page_a_propos_maisons_parent_id_idx" ON "payload"."page_a_propos_maisons" USING btree ("_parent_id");
  CREATE INDEX "page_a_propos_sections_order_idx" ON "payload"."page_a_propos_sections" USING btree ("_order");
  CREATE INDEX "page_a_propos_sections_parent_id_idx" ON "payload"."page_a_propos_sections" USING btree ("_parent_id");
  CREATE INDEX "page_souscription_chantiers_order_idx" ON "payload"."page_souscription_chantiers" USING btree ("_order");
  CREATE INDEX "page_souscription_chantiers_parent_id_idx" ON "payload"."page_souscription_chantiers" USING btree ("_parent_id");
  CREATE INDEX "page_souscription_contreparties_items_order_idx" ON "payload"."page_souscription_contreparties_items" USING btree ("_order");
  CREATE INDEX "page_souscription_contreparties_items_parent_id_idx" ON "payload"."page_souscription_contreparties_items" USING btree ("_parent_id");
  CREATE INDEX "page_souscription_contreparties_order_idx" ON "payload"."page_souscription_contreparties" USING btree ("_order");
  CREATE INDEX "page_souscription_contreparties_parent_id_idx" ON "payload"."page_souscription_contreparties" USING btree ("_parent_id");
  CREATE INDEX "page_souscription_mecenes_order_idx" ON "payload"."page_souscription_mecenes" USING btree ("_order");
  CREATE INDEX "page_souscription_mecenes_parent_id_idx" ON "payload"."page_souscription_mecenes" USING btree ("_parent_id");
  CREATE INDEX "page_souscription_faq_order_idx" ON "payload"."page_souscription_faq" USING btree ("_order");
  CREATE INDEX "page_souscription_faq_parent_id_idx" ON "payload"."page_souscription_faq" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_legales" CASCADE;
  DROP TABLE "payload"."reglages_site_reseaux_sociaux" CASCADE;
  DROP TABLE "payload"."reglages_site" CASCADE;
  DROP TABLE "payload"."page_a_propos_maisons" CASCADE;
  DROP TABLE "payload"."page_a_propos_sections" CASCADE;
  DROP TABLE "payload"."page_a_propos" CASCADE;
  DROP TABLE "payload"."page_souscription_chantiers" CASCADE;
  DROP TABLE "payload"."page_souscription_contreparties_items" CASCADE;
  DROP TABLE "payload"."page_souscription_contreparties" CASCADE;
  DROP TABLE "payload"."page_souscription_mecenes" CASCADE;
  DROP TABLE "payload"."page_souscription_faq" CASCADE;
  DROP TABLE "payload"."page_souscription" CASCADE;
  DROP TYPE "payload"."enum_page_a_propos_maisons_maison";
  DROP TYPE "payload"."enum_page_souscription_contreparties_tier_id";
  DROP TYPE "payload"."enum_page_souscription_mecenes_tier_id";`)
}
