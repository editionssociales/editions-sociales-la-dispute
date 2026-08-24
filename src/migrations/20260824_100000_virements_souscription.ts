import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Virements de souscription (client 2026-08-24) — les contributions
 * encaissées hors Stripe, importées depuis le classeur Excel de l'équipe et
 * comptées dans la jauge de `/souscription` (cf.
 * `payload/collections/VirementsSouscription.ts`, `lib/virements.ts`).
 *
 * `montant_e_u_r` : nommage imposé par la conversion camelCase → snake_case
 * de l'adaptateur Postgres de Payload sur `montantEUR` — exactement comme
 * `total_t_t_c`/`shipping_cost_t_t_c` de `orders` (migration initiale). En
 * euros, comme les montants de commande, jamais en centimes.
 *
 * `cle_import` : empreinte `date|nom|montant` de la ligne du classeur — clé
 * d'idempotence du ré-import (le fichier est cumulatif, réimporté en entier à
 * chaque ajout). NULLable : une ligne saisie à la main n'en a pas, et
 * l'index unique de Postgres laisse coexister autant de NULL que voulu.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "payload"."enum_virements_souscription_palier" AS ENUM('palier-15', 'palier-35', 'palier-50', 'palier-75', 'palier-100', 'palier-200', 'palier-300', 'palier-500', 'palier-1000', 'autre');

  CREATE TABLE "payload"."virements_souscription" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"nom" varchar NOT NULL,
  	"montant_e_u_r" numeric NOT NULL,
  	"palier" "payload"."enum_virements_souscription_palier",
  	"choix_saisi" varchar,
  	"email" varchar,
  	"reference" varchar,
  	"cle_import" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE INDEX "virements_souscription_date_idx" ON "payload"."virements_souscription" USING btree ("date");
  CREATE UNIQUE INDEX "virements_souscription_cle_import_idx" ON "payload"."virements_souscription" USING btree ("cle_import");
  CREATE INDEX "virements_souscription_updated_at_idx" ON "payload"."virements_souscription" USING btree ("updated_at");
  CREATE INDEX "virements_souscription_created_at_idx" ON "payload"."virements_souscription" USING btree ("created_at");

  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "virements_souscription_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_virements_souscription_fk" FOREIGN KEY ("virements_souscription_id") REFERENCES "payload"."virements_souscription"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_virements_souscription_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("virements_souscription_id");
  `)
}

/** Rollback structurel : la table part avec ses données (un virement n'existe nulle part ailleurs — le classeur Excel de l'équipe reste la source, il suffit de le réimporter). */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_virements_souscription_fk";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_virements_souscription_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "virements_souscription_id";

  DROP TABLE "payload"."virements_souscription" CASCADE;
  DROP TYPE IF EXISTS "payload"."enum_virements_souscription_palier";
  `)
}
