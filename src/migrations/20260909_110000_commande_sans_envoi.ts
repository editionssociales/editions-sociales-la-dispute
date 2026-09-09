import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Achat d'un titre numérique seul (client 2026-09-09, suite de
 * `20260909_100000_ebook_numerique_seul`) — trois faits de schéma pour que le
 * moteur de commerce sache qu'une commande n'expédie rien :
 *
 * 1. `orders.shipping_method` gagne la valeur `aucun` (« Aucun envoi
 *    (numérique) », `Orders.ts`) — posée quand TOUTES les lignes d'une
 *    commande sont numériques seules (`cart-quote.ts`). Postgres n'autorise
 *    qu'un `ALTER TYPE ... ADD VALUE` en une passe simple, jamais dans la même
 *    transaction qu'un usage de la valeur — cette migration ne l'utilise pas,
 *    seulement le `down` documenté plus bas doit en tenir compte.
 * 2. `orders_lines.digital` (colonne booléenne, jamais un champ éditable —
 *    `Orders.ts:lines`) snapshote, ligne par ligne, si l'article acheté était
 *    numérique seul AU MOMENT DE LA VENTE — relu fraîchement au webhook
 *    (`commerce-source.ts`, même esprit que `titleSnapshot`/`isbnSnapshot`,
 *    jamais une valeur de `metadata` client) ; sert la colonne « Numérique »
 *    de l'export préparation (`order-export.ts`).
 * 3. Les champs d'adresse (hors `full_name`, qui reste renseigné même sans
 *    envoi — repli sur le nom Stripe puis l'e-mail, `order-webhook-core.ts`)
 *    perdent leur contrainte `NOT NULL` sur `shipping_address`/`billing_address` :
 *    une commande `shippingMethod: "aucun"` n'a tout simplement pas d'adresse
 *    à collecter (`Orders.ts:addressFields`, `validate` conditionnelle sur
 *    `shippingMethod`). `country` garde son défaut ('FR') et reste NOT NULL —
 *    toujours posé par `buildOrderCreateData`, jamais vide en pratique.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "payload"."enum_orders_shipping_method" ADD VALUE 'aucun';

  ALTER TABLE "payload"."orders_lines" ADD COLUMN "digital" boolean DEFAULT false NOT NULL;

  ALTER TABLE "payload"."orders" ALTER COLUMN "shipping_address_address_line1" DROP NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "shipping_address_postal_code" DROP NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "shipping_address_city" DROP NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "billing_address_address_line1" DROP NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "billing_address_postal_code" DROP NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "billing_address_city" DROP NOT NULL;
  `)
}

/**
 * Postgres ne sait pas retirer une valeur d'enum (même limite que
 * `20260821_090000_don_ordertype.ts`) — ici assumée SANS reconstruction du
 * type (contrairement à ce précédent) : une commande `aucun` existante ne
 * peut pas retomber sur `standard` sans mentir sur son port (0 € facturé),
 * alors qu'un `don` retombant sur `commande` restait au moins un type
 * plausible. Le `down` ne touche donc PAS à `enum_orders_shipping_method` —
 * seuls les deux faits structurels réversibles (colonne `digital`, contrainte
 * `NOT NULL` des adresses) sont défaits. Rejouer ce `down` sur une base qui
 * contient déjà des commandes `aucun` avec une adresse vide referait échouer
 * le `SET NOT NULL` : purger ou compléter ces lignes d'abord.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."orders_lines" DROP COLUMN IF EXISTS "digital";

  ALTER TABLE "payload"."orders" ALTER COLUMN "shipping_address_address_line1" SET NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "shipping_address_postal_code" SET NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "shipping_address_city" SET NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "billing_address_address_line1" SET NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "billing_address_postal_code" SET NOT NULL;
  ALTER TABLE "payload"."orders" ALTER COLUMN "billing_address_city" SET NOT NULL;
  `)
}
