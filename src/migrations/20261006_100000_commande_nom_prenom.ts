import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Prénom / nom du destinataire saisis SÉPARÉMENT au paiement (client
 * 2026-10-06 : le « Nom complet » de l'adresse Stripe — seul champ de nom que
 * Stripe Checkout sache collecter — recevait n'importe quoi, et l'export
 * préparation n'avait qu'une heuristique pour en tirer ses colonnes
 * nom/prénom). Collectés par deux `custom_fields` obligatoires de la session
 * (`api/checkout/route.ts`, clés `checkout-core.ts:RECIPIENT_NAME_FIELD_KEYS`)
 * et recopiés par le webhook dans l'adresse de livraison — dupliqués sur
 * l'adresse de facturation comme tout le reste du groupe (`Orders.ts:
 * addressFields`, facturation = copie de la livraison).
 *
 * Nullables, et le resteront : les commandes antérieures, l'historique
 * WooCommerce importé, les dons avec contrepartie (parcours de don sans ces
 * champs) et les commandes sans envoi (rien à étiqueter) n'en ont pas —
 * l'export retombe alors sur l'heuristique `order-export.ts:splitFullName`,
 * jamais une valeur inventée. `full_name` ne bouge pas : il reste le nom
 * d'étiquette tel que saisi.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."orders" ADD COLUMN "shipping_address_first_name" varchar;
  ALTER TABLE "payload"."orders" ADD COLUMN "shipping_address_last_name" varchar;
  ALTER TABLE "payload"."orders" ADD COLUMN "billing_address_first_name" varchar;
  ALTER TABLE "payload"."orders" ADD COLUMN "billing_address_last_name" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."orders" DROP COLUMN IF EXISTS "shipping_address_first_name";
  ALTER TABLE "payload"."orders" DROP COLUMN IF EXISTS "shipping_address_last_name";
  ALTER TABLE "payload"."orders" DROP COLUMN IF EXISTS "billing_address_first_name";
  ALTER TABLE "payload"."orders" DROP COLUMN IF EXISTS "billing_address_last_name";
  `)
}
