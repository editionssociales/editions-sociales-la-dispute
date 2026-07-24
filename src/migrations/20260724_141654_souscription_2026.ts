import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Livraison définitive de la campagne « Souscription 2026 » (docx/xlsx/PDF
 * client, Clara, 2026-07-24) : le global `page-souscription` s'élague au
 * seul bloc `contreparties` (héros, chantiers, mécènes, FAQ supprimés — le
 * récit est désormais éditorial figé dans `souscription/page.tsx`) et la
 * table des paliers passe de 8 contreparties + 2 mécènes (2024) à 9
 * contreparties uniformes (`palier-15` … `palier-1000`, cf.
 * `src/lib/donation-tiers.ts`).
 *
 * Les éventuelles saisies admin de l'ancienne campagne (chantiers, mécènes,
 * FAQ, héros, contreparties sur les anciens paliers 150/500/1000-mécène)
 * sont volontairement perdues : contenu périmé de la campagne Ulule 2024,
 * remplacé par la livraison réelle 2026. Personne n'a pu saisir de contenu
 * sur les nouveaux paliers avant cette migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE "payload"."page_souscription_chantiers" CASCADE;
  DROP TABLE "payload"."page_souscription_mecenes" CASCADE;
  DROP TABLE "payload"."page_souscription_faq" CASCADE;
  DROP TYPE "payload"."enum_page_souscription_mecenes_tier_id";

  ALTER TABLE "payload"."page_souscription"
    DROP COLUMN IF EXISTS "heros_titre",
    DROP COLUMN IF EXISTS "heros_intro";

  ALTER TABLE "payload"."page_souscription_contreparties"
    DROP COLUMN IF EXISTS "soutiens2024",
    DROP COLUMN IF EXISTS "populaire";

  -- Élargit la colonne le temps de reconstruire l'enum avec les 9 nouveaux
  -- ids : DROP TYPE exige qu'aucune colonne ne le référence encore. Postgres
  -- ne caste pas implicitement un enum vers varchar : USING explicite requis.
  ALTER TABLE "payload"."page_souscription_contreparties"
    ALTER COLUMN "tier_id" TYPE varchar USING "tier_id"::text;
  DROP TYPE "payload"."enum_page_souscription_contreparties_tier_id";
  CREATE TYPE "payload"."enum_page_souscription_contreparties_tier_id" AS ENUM(
    'palier-15', 'palier-35', 'palier-50', 'palier-75', 'palier-100',
    'palier-200', 'palier-300', 'palier-500', 'palier-1000'
  );

  -- Lignes saisies sur un ancien palier disparu de la table (150, ou les
  -- ex-mécènes 500/1000 qui ne partageaient pas cet enum) : plus aucun id
  -- valide à recaster dessus, contenu périmé, supprimé.
  DELETE FROM "payload"."page_souscription_contreparties"
    WHERE "tier_id" NOT IN (
      'palier-15', 'palier-35', 'palier-50', 'palier-75', 'palier-100',
      'palier-200', 'palier-300', 'palier-500', 'palier-1000'
    );

  ALTER TABLE "payload"."page_souscription_contreparties"
    ALTER COLUMN "tier_id" TYPE "payload"."enum_page_souscription_contreparties_tier_id"
    USING "tier_id"::"payload"."enum_page_souscription_contreparties_tier_id";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."page_souscription_contreparties"
    ALTER COLUMN "tier_id" TYPE varchar USING "tier_id"::text;
  DROP TYPE "payload"."enum_page_souscription_contreparties_tier_id";
  CREATE TYPE "payload"."enum_page_souscription_contreparties_tier_id" AS ENUM(
    'palier-15', 'palier-35', 'palier-50', 'palier-75', 'palier-100',
    'palier-150', 'palier-200', 'palier-300'
  );
  DELETE FROM "payload"."page_souscription_contreparties"
    WHERE "tier_id" NOT IN (
      'palier-15', 'palier-35', 'palier-50', 'palier-75', 'palier-100',
      'palier-150', 'palier-200', 'palier-300'
    );
  ALTER TABLE "payload"."page_souscription_contreparties"
    ALTER COLUMN "tier_id" TYPE "payload"."enum_page_souscription_contreparties_tier_id"
    USING "tier_id"::"payload"."enum_page_souscription_contreparties_tier_id";

  ALTER TABLE "payload"."page_souscription_contreparties"
    ADD COLUMN "soutiens2024" numeric NOT NULL DEFAULT 0,
    ADD COLUMN "populaire" boolean DEFAULT false;

  ALTER TABLE "payload"."page_souscription"
    ADD COLUMN "heros_titre" varchar,
    ADD COLUMN "heros_intro" varchar;

  CREATE TYPE "payload"."enum_page_souscription_mecenes_tier_id" AS ENUM('mecene-500', 'mecene-1000');

  CREATE TABLE "payload"."page_souscription_chantiers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"desc" varchar NOT NULL
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

  ALTER TABLE "payload"."page_souscription_chantiers" ADD CONSTRAINT "page_souscription_chantiers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_souscription"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_souscription_mecenes" ADD CONSTRAINT "page_souscription_mecenes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_souscription"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_souscription_faq" ADD CONSTRAINT "page_souscription_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_souscription"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX "page_souscription_chantiers_order_idx" ON "payload"."page_souscription_chantiers" USING btree ("_order");
  CREATE INDEX "page_souscription_chantiers_parent_id_idx" ON "payload"."page_souscription_chantiers" USING btree ("_parent_id");
  CREATE INDEX "page_souscription_mecenes_order_idx" ON "payload"."page_souscription_mecenes" USING btree ("_order");
  CREATE INDEX "page_souscription_mecenes_parent_id_idx" ON "payload"."page_souscription_mecenes" USING btree ("_parent_id");
  CREATE INDEX "page_souscription_faq_order_idx" ON "payload"."page_souscription_faq" USING btree ("_order");
  CREATE INDEX "page_souscription_faq_parent_id_idx" ON "payload"."page_souscription_faq" USING btree ("_parent_id");
  `)
}
