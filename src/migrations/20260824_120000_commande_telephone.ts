import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Téléphone du client sur la commande (client 2026-08-24 : colonne « numéro
 * de téléphone » demandée dans l'export des commandes — et utile au
 * transporteur). Collecté par Stripe Checkout à partir de cette date
 * (`phone_number_collection`, `api/checkout/route.ts`) et recopié par le
 * webhook (`customer_details.phone`).
 *
 * Nullable, et le restera : les commandes antérieures, l'historique
 * WooCommerce importé et les dons avec contrepartie (parcours de don SANS
 * collecte de téléphone — un champ de plus se paierait en conversion pendant
 * la campagne) n'en ont pas. La colonne de l'export est vide pour eux, elle
 * ne se remplira jamais rétroactivement.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."orders" ADD COLUMN "phone" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."orders" DROP COLUMN IF EXISTS "phone";
  `)
}
