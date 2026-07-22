import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Collection `rencontres` (agenda public, page `/rencontres`) — remplace les
 * données en dur de `src/lib/rencontres-data.ts`. Sème les 3 événements
 * jusque-là codés en dur, en résolvant le livre lié par sous-requête
 * tolérante (`ILIKE`) sur le titre : `NULL` si le titre ne matche aucune
 * fiche (l'insert n'échoue pas pour autant — `livre_id` est nullable).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "payload"."rencontres" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titre" varchar NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"heure" varchar,
  	"lieu" varchar NOT NULL,
  	"ville" varchar NOT NULL,
  	"livre_id" integer,
  	"image_id" integer,
  	"intervenants" varchar,
  	"description" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload"."rencontres" ADD CONSTRAINT "rencontres_livre_id_books_id_fk" FOREIGN KEY ("livre_id") REFERENCES "payload"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."rencontres" ADD CONSTRAINT "rencontres_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;

  CREATE INDEX "rencontres_livre_idx" ON "payload"."rencontres" USING btree ("livre_id");
  CREATE INDEX "rencontres_image_idx" ON "payload"."rencontres" USING btree ("image_id");
  CREATE INDEX "rencontres_updated_at_idx" ON "payload"."rencontres" USING btree ("updated_at");
  CREATE INDEX "rencontres_created_at_idx" ON "payload"."rencontres" USING btree ("created_at");

  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "rencontres_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rencontres_fk" FOREIGN KEY ("rencontres_id") REFERENCES "payload"."rencontres"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_rencontres_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("rencontres_id");
  `)

  // Seed des 3 rencontres relevées sur ladispute.fr (ex `rencontres-data.ts`,
  // supprimé dans le même commit). Résolution du livre par sous-requête
  // tolérante : NULL si aucun titre ne matche, l'insert n'échoue pas pour
  // autant (`livre_id` nullable) — l'éditrice·eur relie la fiche à la main
  // depuis /admin si le rapprochement automatique échoue.
  await db.execute(sql`
  INSERT INTO "payload"."rencontres"
    ("titre", "date", "heure", "lieu", "ville", "livre_id", "intervenants", "description", "updated_at", "created_at")
  VALUES
  (
    'Présentation du livre « De #MeToo à #NousToutes »',
    '2026-06-23T00:00:00.000Z',
    NULL,
    'Librairie Ombres blanches',
    'Toulouse',
    (SELECT "id" FROM "payload"."books" WHERE "title" ILIKE '%NousToutes%' LIMIT 1),
    'De #MeToo à #NousToutes, Irène Despontin-Lefèvre',
    'Présentation du livre d''Irène Despontin-Lefèvre, De #MeToo à #NousToutes, à la librairie Ombres blanches.',
    now(),
    now()
  ),
  (
    'Présentation du livre « Décoloniser le marxisme »',
    '2026-06-16T00:00:00.000Z',
    NULL,
    'Librairie Terra Nova',
    'Toulouse',
    (SELECT "id" FROM "payload"."books" WHERE "title" ILIKE '%Décoloniser le marxisme%' LIMIT 1),
    'Décoloniser le marxisme, Matthieu Renault',
    'Présentation du livre de Matthieu Renault, Décoloniser le marxisme, à la librairie Terra Nova.',
    now(),
    now()
  ),
  (
    'Table ronde : « L''indépendance de la justice »',
    '2026-05-30T00:00:00.000Z',
    '15h-16h30',
    'Librairie Les traversées',
    'Paris (5e)',
    (SELECT "id" FROM "payload"."books" WHERE "title" ILIKE '%Gouverner les juges%' LIMIT 1),
    'Gouverner les juges, Vincent Sizaire ; avec Marie Dosé et Fabrice Arfi ; modération Lena Dufeutrelle',
    'Table ronde « L''indépendance de la justice » modérée par Lena Dufeutrelle, avec Marie Dosé, Fabrice Arfi et Vincent Sizaire, auteur de Gouverner les juges.',
    now(),
    now()
  );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Rollback structurel : détache d'abord `payload_locked_documents_rels`
  // (une contrainte FK dessus interdirait sinon le `DROP TABLE … CASCADE`,
  // cf. `20260711_212222_highlight.ts`), puis droppe la table — le seed est
  // perdu avec elle, volontairement (rollback = filet de schéma seulement,
  // même choix que `20260719_105000_libelles.ts`).
  await db.execute(sql`
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_rencontres_fk";
  DROP INDEX "payload"."payload_locked_documents_rels_rencontres_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "rencontres_id";
  DROP TABLE "payload"."rencontres" CASCADE;
  `)
}
