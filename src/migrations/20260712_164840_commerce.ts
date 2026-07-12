import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_orders_status" AS ENUM('paid', 'prepared', 'shipped', 'cancelled', 'refunded');
  CREATE TYPE "payload"."enum_orders_shipping_address_country" AS ENUM('FR', 'BE', 'CH');
  CREATE TYPE "payload"."enum_orders_billing_address_country" AS ENUM('FR', 'BE', 'CH');
  CREATE TYPE "payload"."enum_orders_shipping_method" AS ENUM('standard', 'reduit', 'offert');
  CREATE TYPE "payload"."enum_promo_codes_type" AS ENUM('fixed_cart', 'free_shipping');
  CREATE TABLE "payload"."orders_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"book_id" integer NOT NULL,
  	"title_snapshot" varchar NOT NULL,
  	"isbn_snapshot" varchar,
  	"quantity" numeric NOT NULL,
  	"unit_price_t_t_c" numeric NOT NULL
  );
  
  CREATE TABLE "payload"."orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" varchar,
  	"status" "payload"."enum_orders_status" DEFAULT 'paid' NOT NULL,
  	"email" varchar NOT NULL,
  	"shipping_address_full_name" varchar NOT NULL,
  	"shipping_address_address_line1" varchar NOT NULL,
  	"shipping_address_address_line2" varchar,
  	"shipping_address_postal_code" varchar NOT NULL,
  	"shipping_address_city" varchar NOT NULL,
  	"shipping_address_country" "payload"."enum_orders_shipping_address_country" DEFAULT 'FR' NOT NULL,
  	"billing_address_full_name" varchar NOT NULL,
  	"billing_address_address_line1" varchar NOT NULL,
  	"billing_address_address_line2" varchar,
  	"billing_address_postal_code" varchar NOT NULL,
  	"billing_address_city" varchar NOT NULL,
  	"billing_address_country" "payload"."enum_orders_billing_address_country" DEFAULT 'FR' NOT NULL,
  	"shipping_method" "payload"."enum_orders_shipping_method" DEFAULT 'standard' NOT NULL,
  	"shipping_cost_t_t_c" numeric NOT NULL,
  	"promo_code_id" integer,
  	"discount_t_t_c" numeric DEFAULT 0,
  	"total_t_t_c" numeric NOT NULL,
  	"stripe_session_id" varchar NOT NULL,
  	"stripe_payment_intent_id" varchar,
  	"paid_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."promo_codes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"type" "payload"."enum_promo_codes_type" DEFAULT 'fixed_cart' NOT NULL,
  	"amount" numeric,
  	"min_cart" numeric,
  	"expires_at" timestamp(3) with time zone,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."reglages_boutique" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"seuil_alerte_stock_bas" numeric DEFAULT 3 NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."books" ADD COLUMN "commerce_sellable" boolean DEFAULT false;
  ALTER TABLE "payload"."books" ADD COLUMN "commerce_stock" numeric;
  ALTER TABLE "payload"."books" ADD COLUMN "commerce_reduced_shipping_flag" boolean DEFAULT false;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_commerce_sellable" boolean DEFAULT false;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_commerce_stock" numeric;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_commerce_reduced_shipping_flag" boolean DEFAULT false;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "orders_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "promo_codes_id" integer;
  ALTER TABLE "payload"."orders_lines" ADD CONSTRAINT "orders_lines_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "payload"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."orders_lines" ADD CONSTRAINT "orders_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."orders" ADD CONSTRAINT "orders_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "payload"."promo_codes"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "orders_lines_order_idx" ON "payload"."orders_lines" USING btree ("_order");
  CREATE INDEX "orders_lines_parent_id_idx" ON "payload"."orders_lines" USING btree ("_parent_id");
  CREATE INDEX "orders_lines_book_idx" ON "payload"."orders_lines" USING btree ("book_id");
  CREATE UNIQUE INDEX "orders_number_idx" ON "payload"."orders" USING btree ("number");
  CREATE INDEX "orders_promo_code_idx" ON "payload"."orders" USING btree ("promo_code_id");
  CREATE UNIQUE INDEX "orders_stripe_session_id_idx" ON "payload"."orders" USING btree ("stripe_session_id");
  CREATE INDEX "orders_updated_at_idx" ON "payload"."orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "payload"."orders" USING btree ("created_at");
  CREATE UNIQUE INDEX "promo_codes_code_idx" ON "payload"."promo_codes" USING btree ("code");
  CREATE INDEX "promo_codes_updated_at_idx" ON "payload"."promo_codes" USING btree ("updated_at");
  CREATE INDEX "promo_codes_created_at_idx" ON "payload"."promo_codes" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "payload"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_promo_codes_fk" FOREIGN KEY ("promo_codes_id") REFERENCES "payload"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_promo_codes_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("promo_codes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Ordre corrigé par rapport au généré (même correctif que la migration
  // highlight) : DROP TABLE … CASCADE emporte déjà les contraintes FK posées
  // sur payload_locked_documents_rels — les dropper ensuite échouerait. On
  // détache donc les dépendances AVANT de dropper les tables.
  await db.execute(sql`
   ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_orders_fk";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_promo_codes_fk";
  DROP INDEX "payload"."payload_locked_documents_rels_orders_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_promo_codes_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "orders_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "promo_codes_id";
  ALTER TABLE "payload"."books" DROP COLUMN "commerce_sellable";
  ALTER TABLE "payload"."books" DROP COLUMN "commerce_stock";
  ALTER TABLE "payload"."books" DROP COLUMN "commerce_reduced_shipping_flag";
  ALTER TABLE "payload"."_books_v" DROP COLUMN "version_commerce_sellable";
  ALTER TABLE "payload"."_books_v" DROP COLUMN "version_commerce_stock";
  ALTER TABLE "payload"."_books_v" DROP COLUMN "version_commerce_reduced_shipping_flag";
  ALTER TABLE "payload"."orders_lines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."promo_codes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."reglages_boutique" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."orders_lines" CASCADE;
  DROP TABLE "payload"."orders" CASCADE;
  DROP TABLE "payload"."promo_codes" CASCADE;
  DROP TABLE "payload"."reglages_boutique" CASCADE;
  DROP TYPE "payload"."enum_orders_status";
  DROP TYPE "payload"."enum_orders_shipping_address_country";
  DROP TYPE "payload"."enum_orders_billing_address_country";
  DROP TYPE "payload"."enum_orders_shipping_method";
  DROP TYPE "payload"."enum_promo_codes_type";`)
}
