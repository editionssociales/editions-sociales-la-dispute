import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE SCHEMA IF NOT EXISTS "payload";
   CREATE TYPE "payload"."enum_users_role" AS ENUM('admin', 'editor');
  CREATE TYPE "payload"."enum_collections_edition" AS ENUM('editions-sociales', 'la-dispute');
  CREATE TYPE "payload"."enum_books_edition" AS ENUM('editions-sociales', 'la-dispute');
  CREATE TYPE "payload"."enum_books_origin" AS ENUM('catalogue', 'boutique');
  CREATE TYPE "payload"."enum_books_wp_source_site" AS ENUM('editions-sociales', 'la-dispute');
  CREATE TYPE "payload"."enum_books_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__books_v_version_edition" AS ENUM('editions-sociales', 'la-dispute');
  CREATE TYPE "payload"."enum__books_v_version_origin" AS ENUM('catalogue', 'boutique');
  CREATE TYPE "payload"."enum__books_v_version_wp_source_site" AS ENUM('editions-sociales', 'la-dispute');
  CREATE TYPE "payload"."enum__books_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "payload"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "payload"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" "payload"."enum_users_role" DEFAULT 'editor' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"source_url" varchar,
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
  
  CREATE TABLE "payload"."authors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"bio" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."collections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"edition" "payload"."enum_collections_edition" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."books" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"edition" "payload"."enum_books_edition",
  	"origin" "payload"."enum_books_origin" DEFAULT 'catalogue',
  	"presentation" jsonb,
  	"presentation_legacy_html" varchar,
  	"plus_loin" jsonb,
  	"plus_loin_legacy_html" varchar,
  	"content_touched" boolean DEFAULT false,
  	"isbn" varchar,
  	"prix" numeric,
  	"pages" numeric,
  	"date_parution" timestamp(3) with time zone,
  	"sort_date" timestamp(3) with time zone,
  	"a_paraitre" boolean DEFAULT false,
  	"collection_id" integer,
  	"cover_id" integer,
  	"cover_fallback_url" varchar,
  	"table_pdf_id" integer,
  	"extrait_pdf_id" integer,
  	"buy_boutique_url" varchar,
  	"buy_parislibrairies" varchar,
  	"buy_lalibrairie" varchar,
  	"wp_source_site" "payload"."enum_books_wp_source_site",
  	"wp_source_wp_id" numeric,
  	"wp_source_wp_slug" varchar,
  	"wp_source_wp_date" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_books_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."books_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer
  );
  
  CREATE TABLE "payload"."_books_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_edition" "payload"."enum__books_v_version_edition",
  	"version_origin" "payload"."enum__books_v_version_origin" DEFAULT 'catalogue',
  	"version_presentation" jsonb,
  	"version_presentation_legacy_html" varchar,
  	"version_plus_loin" jsonb,
  	"version_plus_loin_legacy_html" varchar,
  	"version_content_touched" boolean DEFAULT false,
  	"version_isbn" varchar,
  	"version_prix" numeric,
  	"version_pages" numeric,
  	"version_date_parution" timestamp(3) with time zone,
  	"version_sort_date" timestamp(3) with time zone,
  	"version_a_paraitre" boolean DEFAULT false,
  	"version_collection_id" integer,
  	"version_cover_id" integer,
  	"version_cover_fallback_url" varchar,
  	"version_table_pdf_id" integer,
  	"version_extrait_pdf_id" integer,
  	"version_buy_boutique_url" varchar,
  	"version_buy_parislibrairies" varchar,
  	"version_buy_lalibrairie" varchar,
  	"version_wp_source_site" "payload"."enum__books_v_version_wp_source_site",
  	"version_wp_source_wp_id" numeric,
  	"version_wp_source_wp_slug" varchar,
  	"version_wp_source_wp_date" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__books_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "payload"."_books_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer
  );
  
  CREATE TABLE "payload"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"authors_id" integer,
  	"collections_id" integer,
  	"books_id" integer
  );
  
  CREATE TABLE "payload"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."books" ADD CONSTRAINT "books_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "payload"."collections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."books" ADD CONSTRAINT "books_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."books" ADD CONSTRAINT "books_table_pdf_id_media_id_fk" FOREIGN KEY ("table_pdf_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."books" ADD CONSTRAINT "books_extrait_pdf_id_media_id_fk" FOREIGN KEY ("extrait_pdf_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."books_rels" ADD CONSTRAINT "books_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."books"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."books_rels" ADD CONSTRAINT "books_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "payload"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_books_v" ADD CONSTRAINT "_books_v_parent_id_books_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_books_v" ADD CONSTRAINT "_books_v_version_collection_id_collections_id_fk" FOREIGN KEY ("version_collection_id") REFERENCES "payload"."collections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_books_v" ADD CONSTRAINT "_books_v_version_cover_id_media_id_fk" FOREIGN KEY ("version_cover_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_books_v" ADD CONSTRAINT "_books_v_version_table_pdf_id_media_id_fk" FOREIGN KEY ("version_table_pdf_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_books_v" ADD CONSTRAINT "_books_v_version_extrait_pdf_id_media_id_fk" FOREIGN KEY ("version_extrait_pdf_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_books_v_rels" ADD CONSTRAINT "_books_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_books_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_books_v_rels" ADD CONSTRAINT "_books_v_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "payload"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "payload"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_collections_fk" FOREIGN KEY ("collections_id") REFERENCES "payload"."collections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_books_fk" FOREIGN KEY ("books_id") REFERENCES "payload"."books"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "payload"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "payload"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "payload"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "payload"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "payload"."users" USING btree ("email");
  CREATE UNIQUE INDEX "media_source_url_idx" ON "payload"."media" USING btree ("source_url");
  CREATE INDEX "media_updated_at_idx" ON "payload"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "payload"."media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "payload"."media" USING btree ("filename");
  CREATE UNIQUE INDEX "authors_slug_idx" ON "payload"."authors" USING btree ("slug");
  CREATE INDEX "authors_updated_at_idx" ON "payload"."authors" USING btree ("updated_at");
  CREATE INDEX "authors_created_at_idx" ON "payload"."authors" USING btree ("created_at");
  CREATE INDEX "collections_slug_idx" ON "payload"."collections" USING btree ("slug");
  CREATE INDEX "collections_updated_at_idx" ON "payload"."collections" USING btree ("updated_at");
  CREATE INDEX "collections_created_at_idx" ON "payload"."collections" USING btree ("created_at");
  CREATE UNIQUE INDEX "edition_slug_idx" ON "payload"."collections" USING btree ("edition","slug");
  CREATE INDEX "books_slug_idx" ON "payload"."books" USING btree ("slug");
  CREATE INDEX "books_edition_idx" ON "payload"."books" USING btree ("edition");
  CREATE INDEX "books_collection_idx" ON "payload"."books" USING btree ("collection_id");
  CREATE INDEX "books_cover_idx" ON "payload"."books" USING btree ("cover_id");
  CREATE INDEX "books_table_pdf_idx" ON "payload"."books" USING btree ("table_pdf_id");
  CREATE INDEX "books_extrait_pdf_idx" ON "payload"."books" USING btree ("extrait_pdf_id");
  CREATE INDEX "books_updated_at_idx" ON "payload"."books" USING btree ("updated_at");
  CREATE INDEX "books_created_at_idx" ON "payload"."books" USING btree ("created_at");
  CREATE INDEX "books__status_idx" ON "payload"."books" USING btree ("_status");
  CREATE UNIQUE INDEX "edition_slug_1_idx" ON "payload"."books" USING btree ("edition","slug");
  CREATE UNIQUE INDEX "wpSource_site_wpSource_wpId_idx" ON "payload"."books" USING btree ("wp_source_site","wp_source_wp_id");
  CREATE INDEX "books_rels_order_idx" ON "payload"."books_rels" USING btree ("order");
  CREATE INDEX "books_rels_parent_idx" ON "payload"."books_rels" USING btree ("parent_id");
  CREATE INDEX "books_rels_path_idx" ON "payload"."books_rels" USING btree ("path");
  CREATE INDEX "books_rels_authors_id_idx" ON "payload"."books_rels" USING btree ("authors_id");
  CREATE INDEX "_books_v_parent_idx" ON "payload"."_books_v" USING btree ("parent_id");
  CREATE INDEX "_books_v_version_version_slug_idx" ON "payload"."_books_v" USING btree ("version_slug");
  CREATE INDEX "_books_v_version_version_edition_idx" ON "payload"."_books_v" USING btree ("version_edition");
  CREATE INDEX "_books_v_version_version_collection_idx" ON "payload"."_books_v" USING btree ("version_collection_id");
  CREATE INDEX "_books_v_version_version_cover_idx" ON "payload"."_books_v" USING btree ("version_cover_id");
  CREATE INDEX "_books_v_version_version_table_pdf_idx" ON "payload"."_books_v" USING btree ("version_table_pdf_id");
  CREATE INDEX "_books_v_version_version_extrait_pdf_idx" ON "payload"."_books_v" USING btree ("version_extrait_pdf_id");
  CREATE INDEX "_books_v_version_version_updated_at_idx" ON "payload"."_books_v" USING btree ("version_updated_at");
  CREATE INDEX "_books_v_version_version_created_at_idx" ON "payload"."_books_v" USING btree ("version_created_at");
  CREATE INDEX "_books_v_version_version__status_idx" ON "payload"."_books_v" USING btree ("version__status");
  CREATE INDEX "_books_v_created_at_idx" ON "payload"."_books_v" USING btree ("created_at");
  CREATE INDEX "_books_v_updated_at_idx" ON "payload"."_books_v" USING btree ("updated_at");
  CREATE INDEX "_books_v_latest_idx" ON "payload"."_books_v" USING btree ("latest");
  CREATE INDEX "version_edition_version_slug_idx" ON "payload"."_books_v" USING btree ("version_edition","version_slug");
  CREATE INDEX "version_wpSource_site_version_wpSource_wpId_idx" ON "payload"."_books_v" USING btree ("version_wp_source_site","version_wp_source_wp_id");
  CREATE INDEX "_books_v_rels_order_idx" ON "payload"."_books_v_rels" USING btree ("order");
  CREATE INDEX "_books_v_rels_parent_idx" ON "payload"."_books_v_rels" USING btree ("parent_id");
  CREATE INDEX "_books_v_rels_path_idx" ON "payload"."_books_v_rels" USING btree ("path");
  CREATE INDEX "_books_v_rels_authors_id_idx" ON "payload"."_books_v_rels" USING btree ("authors_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_authors_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("authors_id");
  CREATE INDEX "payload_locked_documents_rels_collections_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("collections_id");
  CREATE INDEX "payload_locked_documents_rels_books_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("books_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload"."payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."users_sessions" CASCADE;
  DROP TABLE "payload"."users" CASCADE;
  DROP TABLE "payload"."media" CASCADE;
  DROP TABLE "payload"."authors" CASCADE;
  DROP TABLE "payload"."collections" CASCADE;
  DROP TABLE "payload"."books" CASCADE;
  DROP TABLE "payload"."books_rels" CASCADE;
  DROP TABLE "payload"."_books_v" CASCADE;
  DROP TABLE "payload"."_books_v_rels" CASCADE;
  DROP TABLE "payload"."payload_kv" CASCADE;
  DROP TABLE "payload"."payload_locked_documents" CASCADE;
  DROP TABLE "payload"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload"."payload_preferences" CASCADE;
  DROP TABLE "payload"."payload_preferences_rels" CASCADE;
  DROP TABLE "payload"."payload_migrations" CASCADE;
  DROP TYPE "payload"."enum_users_role";
  DROP TYPE "payload"."enum_collections_edition";
  DROP TYPE "payload"."enum_books_edition";
  DROP TYPE "payload"."enum_books_origin";
  DROP TYPE "payload"."enum_books_wp_source_site";
  DROP TYPE "payload"."enum_books_status";
  DROP TYPE "payload"."enum__books_v_version_edition";
  DROP TYPE "payload"."enum__books_v_version_origin";
  DROP TYPE "payload"."enum__books_v_version_wp_source_site";
  DROP TYPE "payload"."enum__books_v_version_status";`)
}
