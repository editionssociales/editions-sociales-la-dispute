import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_orders_status" ADD VALUE 'failed';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."orders" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "payload"."orders" ALTER COLUMN "status" SET DEFAULT 'paid'::text;
  DROP TYPE "payload"."enum_orders_status";
  CREATE TYPE "payload"."enum_orders_status" AS ENUM('paid', 'prepared', 'shipped', 'cancelled', 'refunded');
  ALTER TABLE "payload"."orders" ALTER COLUMN "status" SET DEFAULT 'paid'::"payload"."enum_orders_status";
  ALTER TABLE "payload"."orders" ALTER COLUMN "status" SET DATA TYPE "payload"."enum_orders_status" USING "status"::"payload"."enum_orders_status";`)
}
