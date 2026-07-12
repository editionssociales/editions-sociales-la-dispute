import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."books" ADD COLUMN "commerce_stock_updated_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_commerce_stock_updated_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."books" DROP COLUMN "commerce_stock_updated_at";
  ALTER TABLE "payload"."_books_v" DROP COLUMN "version_commerce_stock_updated_at";`)
}
