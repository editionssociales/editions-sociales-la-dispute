import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."import_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nb_lignes" numeric NOT NULL,
  	"nb_matchees" numeric NOT NULL,
  	"rapport" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "import_runs_id" integer;
  CREATE INDEX "import_runs_updated_at_idx" ON "payload"."import_runs" USING btree ("updated_at");
  CREATE INDEX "import_runs_created_at_idx" ON "payload"."import_runs" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_import_runs_fk" FOREIGN KEY ("import_runs_id") REFERENCES "payload"."import_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_import_runs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("import_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."import_runs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."import_runs" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_import_runs_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_import_runs_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "import_runs_id";`)
}
