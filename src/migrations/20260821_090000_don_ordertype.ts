import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Dons avec contrepartie (client 2026-08-21) — troisième valeur `don` de
 * `orders.order_type` (jusqu'ici `commande`|`precommande`). Postgres autorise
 * `ALTER TYPE ... ADD VALUE` en une passe simple ; la clé d'idempotence du
 * webhook reste le couple `(stripe_session_id, order_type)` — inchangée,
 * l'index composite unique couvre déjà `don` sans modification. Étanchéité
 * comptable (exigence dure du client) : une commande `don` n'est PAS une
 * vente — elle reste hors de tout agrégat de CA/TVA (export compta, « Ventes
 * du mois » du dashboard), portée uniquement au niveau applicatif
 * (`order-export.ts`, `Dashboard.tsx`), pas ici.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "payload"."enum_orders_order_type" ADD VALUE 'don';
  `)
}

/**
 * Postgres ne sait pas retirer une valeur d'enum : neutralise d'abord les
 * lignes existantes (repli sur `commande`, jamais de commande orpheline d'un
 * type qui n'existe plus après le down), puis reconstruit le type sans
 * `don` — colonne repassée en `text` le temps du swap (DEFAULT déposé
 * d'abord, il bloquerait le `DROP TYPE`), `DROP`/`CREATE TYPE`, recast
 * `USING`, puis restauration `DEFAULT`/`NOT NULL` et des deux index perdus
 * par le changement de type de colonne (`orders_order_type_idx` et l'index
 * unique composite avec `stripe_session_id`, cf. migration précommande).
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "payload"."orders" SET "order_type" = 'commande' WHERE "order_type" = 'don';

  DROP INDEX "payload"."orders_order_type_idx";
  DROP INDEX "payload"."orders_stripe_session_id_order_type_idx";

  ALTER TABLE "payload"."orders" ALTER COLUMN "order_type" DROP DEFAULT;
  ALTER TABLE "payload"."orders" ALTER COLUMN "order_type" TYPE text USING "order_type"::text;
  DROP TYPE "payload"."enum_orders_order_type";
  CREATE TYPE "payload"."enum_orders_order_type" AS ENUM('commande', 'precommande');
  ALTER TABLE "payload"."orders" ALTER COLUMN "order_type" TYPE "payload"."enum_orders_order_type" USING "order_type"::"payload"."enum_orders_order_type";
  ALTER TABLE "payload"."orders" ALTER COLUMN "order_type" SET DEFAULT 'commande';
  ALTER TABLE "payload"."orders" ALTER COLUMN "order_type" SET NOT NULL;

  CREATE INDEX "orders_order_type_idx" ON "payload"."orders" USING btree ("order_type");
  CREATE UNIQUE INDEX "orders_stripe_session_id_order_type_idx" ON "payload"."orders" USING btree ("stripe_session_id","order_type");
  `)
}
