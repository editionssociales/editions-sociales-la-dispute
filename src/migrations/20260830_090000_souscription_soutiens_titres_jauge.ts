import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Souscription, demandes client 2026-08-29 : (1) les TITRES courts des trois
 * paliers de jauge (« On sauve les meubles » / « On résiste » /
 * « On construit ») deviennent éditables à côté des descriptions qui
 * l'étaient déjà — même contrat « vide = défaut dur » (défauts :
 * `CAMPAIGN_2026_PALIERS[].label`) ; les MONTANTS restent en code, ils
 * pilotent la jauge. (2) Nouveau tableau `soutiens` sur le global
 * (« Ils et elles nous soutiennent ») : visuels défilants éditoriaux —
 * image requise côté admin (colonne nullable + SET NULL, convention Payload,
 * cf. `rencontres.image_id`), légende et lien optionnels, ordre d'affichage
 * = ordre de saisie de l'array ; tableau vide = section absente du rendu.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."page_souscription" ADD COLUMN "objectifs_titre50" varchar;
  ALTER TABLE "payload"."page_souscription" ADD COLUMN "objectifs_titre80" varchar;
  ALTER TABLE "payload"."page_souscription" ADD COLUMN "objectifs_titre100" varchar;

  CREATE TABLE "payload"."page_souscription_soutiens" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"legende" varchar,
  	"lien" varchar
  );

  ALTER TABLE "payload"."page_souscription_soutiens" ADD CONSTRAINT "page_souscription_soutiens_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."page_souscription"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."page_souscription_soutiens" ADD CONSTRAINT "page_souscription_soutiens_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "page_souscription_soutiens_order_idx" ON "payload"."page_souscription_soutiens" USING btree ("_order");
  CREATE INDEX "page_souscription_soutiens_parent_id_idx" ON "payload"."page_souscription_soutiens" USING btree ("_parent_id");
  CREATE INDEX "page_souscription_soutiens_image_idx" ON "payload"."page_souscription_soutiens" USING btree ("image_id");
  `)
}

/** Rollback structurel : les titres et soutiens saisis partent avec (défauts durs et section absente reprennent la main — rien d'autre ne lit ces champs). */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "payload"."page_souscription_soutiens";
  ALTER TABLE "payload"."page_souscription" DROP COLUMN IF EXISTS "objectifs_titre50";
  ALTER TABLE "payload"."page_souscription" DROP COLUMN IF EXISTS "objectifs_titre80";
  ALTER TABLE "payload"."page_souscription" DROP COLUMN IF EXISTS "objectifs_titre100";
  `)
}
