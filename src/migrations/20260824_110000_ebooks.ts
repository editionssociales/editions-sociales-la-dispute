import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Livre numérique livré après achat (client 2026-08-24 : « pour les Notes sur
 * Mill, on pouvait télécharger l'epub après achat ») — collection d'upload
 * `ebooks`, un fichier par titre (`livre_id` unique).
 *
 * Collection SÉPARÉE de `media` (et non un champ upload de plus vers `media`)
 * parce que `media` est en lecture publique et sert ses fichiers depuis des
 * URLs Blob directes depuis l'audit coûts du 2026-08-23 : un ePub payant
 * déposé là serait publiable par quiconque connaît son nom. Ici l'access
 * control Payload reste actif (`Ebooks.ts`) et le public passe par un lien
 * signé (`/telechargement/[token]`).
 *
 * Le lien titre↔fichier est porté par `ebooks.livre_id` et NON par une
 * colonne de plus sur `books` : `20260821_160000_produits_contreparties`
 * seede `books` par la Local API, c'est-à-dire avec le schéma COURANT du
 * code — toute colonne ajoutée à `books` aujourd'hui casserait le rejeu de
 * cette migration sur une base neuve (build hermétique de la CI, `DEVOPS.md`
 * § Pipeline). Vérifié : replay complet sur Postgres 17 vierge.
 *
 * `livre_id` est NOT NULL avec une FK `ON DELETE set null` — c'est ce que
 * génère Payload pour une relation `required` (`Ebooks.ts`), et la
 * contradiction est VOULUE côté base : supprimer une fiche livre qui a
 * encore un fichier numérique échoue au lieu de laisser un fichier orphelin.
 * Supprimer d'abord le fichier, ensuite la fiche.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "payload"."ebooks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"livre_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );

  ALTER TABLE "payload"."ebooks" ADD CONSTRAINT "ebooks_livre_id_books_id_fk" FOREIGN KEY ("livre_id") REFERENCES "payload"."books"("id") ON DELETE set null ON UPDATE no action;

  CREATE UNIQUE INDEX "ebooks_livre_idx" ON "payload"."ebooks" USING btree ("livre_id");
  CREATE INDEX "ebooks_updated_at_idx" ON "payload"."ebooks" USING btree ("updated_at");
  CREATE INDEX "ebooks_created_at_idx" ON "payload"."ebooks" USING btree ("created_at");
  CREATE UNIQUE INDEX "ebooks_filename_idx" ON "payload"."ebooks" USING btree ("filename");

  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "ebooks_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ebooks_fk" FOREIGN KEY ("ebooks_id") REFERENCES "payload"."ebooks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ebooks_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("ebooks_id");
  `)
}

/** Rollback structurel : les fichiers déjà déposés dans Blob ne sont pas supprimés (rien d'irréversible), seules les fiches et le rattachement partent. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_ebooks_fk";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_ebooks_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "ebooks_id";

  DROP TABLE "payload"."ebooks" CASCADE;
  `)
}
