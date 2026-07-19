import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Remplace les collections éditoriales (0..1, scopées par maison) par des
 * libellés thématiques transversaux (0..n). Sème la première liste majeure
 * et reclasse les livres via le mapping des anciens slugs WP.
 *
 * « Hors collection » n'est pas mappé → livre sans libellé.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "payload"."libelles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE UNIQUE INDEX "libelles_slug_idx" ON "payload"."libelles" USING btree ("slug");
  CREATE INDEX "libelles_updated_at_idx" ON "payload"."libelles" USING btree ("updated_at");
  CREATE INDEX "libelles_created_at_idx" ON "payload"."libelles" USING btree ("created_at");

  INSERT INTO "payload"."libelles" ("name", "slug") VALUES
    ('Introduction', 'introduction'),
    ('Essentiels', 'essentiels'),
    ('GEME', 'geme'),
    ('Marxisme & économie politique', 'marxisme-economie-politique'),
    ('Histoire', 'histoire'),
    ('Philosophie', 'philosophie'),
    ('Travail & salariat', 'travail-salariat'),
    ('École & éducation', 'ecole-education'),
    ('Genre & sexualités', 'genre-sexualites'),
    ('Racisme & colonialisme', 'racisme-colonialisme'),
    ('État, droit & institutions', 'etat-droit-institutions'),
    ('Mouvements sociaux', 'mouvements-sociaux'),
    ('Entretiens & témoignages', 'entretiens-temoignages'),
    ('Actualité & interventions', 'actualite-interventions'),
    ('Documents & archives', 'documents-archives'),
    ('Écologie', 'ecologie'),
    ('International & géopolitique', 'international-geopolitique'),
    ('Culture & critique', 'culture-critique');

  ALTER TABLE "payload"."books_rels" ADD COLUMN "libelles_id" integer;
  ALTER TABLE "payload"."_books_v_rels" ADD COLUMN "libelles_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "libelles_id" integer;

  ALTER TABLE "payload"."books_rels" ADD CONSTRAINT "books_rels_libelles_fk" FOREIGN KEY ("libelles_id") REFERENCES "payload"."libelles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_books_v_rels" ADD CONSTRAINT "_books_v_rels_libelles_fk" FOREIGN KEY ("libelles_id") REFERENCES "payload"."libelles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_libelles_fk" FOREIGN KEY ("libelles_id") REFERENCES "payload"."libelles"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX "books_rels_libelles_id_idx" ON "payload"."books_rels" USING btree ("libelles_id");
  CREATE INDEX "_books_v_rels_libelles_id_idx" ON "payload"."_books_v_rels" USING btree ("libelles_id");
  CREATE INDEX "payload_locked_documents_rels_libelles_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("libelles_id");

  -- Reclassement des livres : ancien slug de collection → nouveau libellé.
  INSERT INTO "payload"."books_rels" ("order", "parent_id", "path", "libelles_id")
  SELECT
    0,
    b.id,
    'libelles',
    l.id
  FROM "payload"."books" b
  INNER JOIN "payload"."collections" c ON c.id = b.collection_id
  INNER JOIN "payload"."libelles" l ON l.slug = CASE c.slug
    WHEN 'les-propedeutiques' THEN 'introduction'
    WHEN 'les-essentielles' THEN 'essentiels'
    WHEN 'geme' THEN 'geme'
    WHEN 'histoire' THEN 'histoire'
    WHEN 'les-eclairees' THEN 'philosophie'
    WHEN 'les-paralleles' THEN 'documents-archives'
    WHEN 'les-irregulieres' THEN 'actualite-interventions'
    WHEN 'ancien-fonds' THEN 'documents-archives'
    WHEN 'le-genre-du-monde' THEN 'genre-sexualites'
    WHEN 'genre-monde' THEN 'genre-sexualites'
    WHEN 'l-enjeu-scolaire' THEN 'ecole-education'
    WHEN 'lenjeu-scolaire' THEN 'ecole-education'
    WHEN 'travail-et-salariat' THEN 'travail-salariat'
    WHEN 'entretiens' THEN 'entretiens-temoignages'
    WHEN 'les-lettres-bleues' THEN 'entretiens-temoignages'
    ELSE NULL
  END
  WHERE b.collection_id IS NOT NULL;

  INSERT INTO "payload"."_books_v_rels" ("order", "parent_id", "path", "libelles_id")
  SELECT
    0,
    v.id,
    'libelles',
    l.id
  FROM "payload"."_books_v" v
  INNER JOIN "payload"."collections" c ON c.id = v.version_collection_id
  INNER JOIN "payload"."libelles" l ON l.slug = CASE c.slug
    WHEN 'les-propedeutiques' THEN 'introduction'
    WHEN 'les-essentielles' THEN 'essentiels'
    WHEN 'geme' THEN 'geme'
    WHEN 'histoire' THEN 'histoire'
    WHEN 'les-eclairees' THEN 'philosophie'
    WHEN 'les-paralleles' THEN 'documents-archives'
    WHEN 'les-irregulieres' THEN 'actualite-interventions'
    WHEN 'ancien-fonds' THEN 'documents-archives'
    WHEN 'le-genre-du-monde' THEN 'genre-sexualites'
    WHEN 'genre-monde' THEN 'genre-sexualites'
    WHEN 'l-enjeu-scolaire' THEN 'ecole-education'
    WHEN 'lenjeu-scolaire' THEN 'ecole-education'
    WHEN 'travail-et-salariat' THEN 'travail-salariat'
    WHEN 'entretiens' THEN 'entretiens-temoignages'
    WHEN 'les-lettres-bleues' THEN 'entretiens-temoignages'
    ELSE NULL
  END
  WHERE v.version_collection_id IS NOT NULL;
  `)

  // Verrous admin ouverts sur une collection éditoriale : rares, non
  // critiques — on droppe la colonne sans migration de contenu.
  await db.execute(sql`
  ALTER TABLE "payload"."books" DROP CONSTRAINT IF EXISTS "books_collection_id_collections_id_fk";
  ALTER TABLE "payload"."_books_v" DROP CONSTRAINT IF EXISTS "_books_v_version_collection_id_collections_id_fk";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_collections_fk";

  DROP INDEX IF EXISTS "payload"."books_collection_idx";
  DROP INDEX IF EXISTS "payload"."_books_v_version_version_collection_idx";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_collections_id_idx";
  DROP INDEX IF EXISTS "payload"."edition_slug_1_idx";

  ALTER TABLE "payload"."books" DROP COLUMN IF EXISTS "collection_id";
  ALTER TABLE "payload"."_books_v" DROP COLUMN IF EXISTS "version_collection_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "collections_id";

  DROP TABLE "payload"."collections" CASCADE;
  DROP TYPE IF EXISTS "payload"."enum_collections_edition";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Rollback structurel minimal : recrée collections vides + FK livres.
  // Les affectations livres↔libellés et le seed ne sont pas restaurés
  // (données perdues volontairement — rollback = filet de schéma seulement).
  await db.execute(sql`
  CREATE TYPE "payload"."enum_collections_edition" AS ENUM('editions-sociales', 'la-dispute');

  CREATE TABLE "payload"."collections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"edition" "payload"."enum_collections_edition" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE INDEX "collections_slug_idx" ON "payload"."collections" USING btree ("slug");
  CREATE INDEX "collections_updated_at_idx" ON "payload"."collections" USING btree ("updated_at");
  CREATE INDEX "collections_created_at_idx" ON "payload"."collections" USING btree ("created_at");
  CREATE UNIQUE INDEX "edition_slug_1_idx" ON "payload"."collections" USING btree ("edition","slug");

  ALTER TABLE "payload"."books" ADD COLUMN "collection_id" integer;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_collection_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "collections_id" integer;

  ALTER TABLE "payload"."books" ADD CONSTRAINT "books_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "payload"."collections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_books_v" ADD CONSTRAINT "_books_v_version_collection_id_collections_id_fk" FOREIGN KEY ("version_collection_id") REFERENCES "payload"."collections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_collections_fk" FOREIGN KEY ("collections_id") REFERENCES "payload"."collections"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX "books_collection_idx" ON "payload"."books" USING btree ("collection_id");
  CREATE INDEX "_books_v_version_version_collection_idx" ON "payload"."_books_v" USING btree ("version_collection_id");
  CREATE INDEX "payload_locked_documents_rels_collections_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("collections_id");

  ALTER TABLE "payload"."books_rels" DROP CONSTRAINT IF EXISTS "books_rels_libelles_fk";
  ALTER TABLE "payload"."_books_v_rels" DROP CONSTRAINT IF EXISTS "_books_v_rels_libelles_fk";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_libelles_fk";

  DROP INDEX IF EXISTS "payload"."books_rels_libelles_id_idx";
  DROP INDEX IF EXISTS "payload"."_books_v_rels_libelles_id_idx";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_libelles_id_idx";

  DELETE FROM "payload"."books_rels" WHERE "path" = 'libelles';
  DELETE FROM "payload"."_books_v_rels" WHERE "path" = 'libelles';

  ALTER TABLE "payload"."books_rels" DROP COLUMN IF EXISTS "libelles_id";
  ALTER TABLE "payload"."_books_v_rels" DROP COLUMN IF EXISTS "libelles_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "libelles_id";

  DROP TABLE "payload"."libelles" CASCADE;
  `)
}
