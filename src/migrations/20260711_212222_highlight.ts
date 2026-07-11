import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."highlight" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"texte" varchar,
  	"lien" varchar,
  	"date_debut" timestamp(3) with time zone NOT NULL,
  	"date_fin" timestamp(3) with time zone NOT NULL,
  	"actif" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "highlight_id" integer;
  CREATE INDEX "highlight_updated_at_idx" ON "payload"."highlight" USING btree ("updated_at");
  CREATE INDEX "highlight_created_at_idx" ON "payload"."highlight" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_highlight_fk" FOREIGN KEY ("highlight_id") REFERENCES "payload"."highlight"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_highlight_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("highlight_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Ordre corrigé par rapport au généré : DROP TABLE … CASCADE emporte déjà la
  // contrainte FK posée sur payload_locked_documents_rels — la dropper ensuite
  // échouerait. On détache donc les dépendances AVANT de dropper la table.
  await db.execute(sql`
   ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_highlight_fk";
  DROP INDEX "payload"."payload_locked_documents_rels_highlight_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "highlight_id";
  DROP TABLE "payload"."highlight" CASCADE;`)
}
