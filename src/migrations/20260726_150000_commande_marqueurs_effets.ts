import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Marqueurs d'effet du webhook Stripe (issue #64) — `createPaidOrder`
 * (`order-handler.ts`) déduplique désormais PAR EFFET plutôt qu'à l'entrée :
 * un rejeu après échec partiel (process mort après `createOrder`, avant le
 * décrément de stock ou l'e-mail de confirmation) doit reprendre exactement
 * ce qui manque, jamais recommencer depuis le début ni ressortir en silence.
 *
 * Backfill des commandes déjà en base : toute commande dont le statut n'est
 * PAS `failed` (paid/prepared/shipped/cancelled/refunded) a nécessairement
 * traversé l'ancien `createPaidOrder` jusqu'au bout (décrément + e-mail
 * inclus) AVANT que ce correctif n'existe — hypothèse de reprise
 * raisonnable, mais à vérifier au déploiement si des commandes connues
 * étaient restées incomplètes suite à l'incident visé par #64 (auquel cas
 * repasser leurs marqueurs à `false` à la main pour qu'un rejeu Stripe les
 * complète). Les commandes `failed` n'ont jamais eu ni décrément ni e-mail
 * (aucune vente) — restent à `false`/`false`, la valeur par défaut.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."orders" ADD COLUMN "stock_decremented" boolean DEFAULT false NOT NULL;
  ALTER TABLE "payload"."orders" ADD COLUMN "confirmation_sent" boolean DEFAULT false NOT NULL;
  `)

  await db.execute(sql`
  UPDATE "payload"."orders" SET "stock_decremented" = true, "confirmation_sent" = true WHERE "status" != 'failed';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."orders" DROP COLUMN "stock_decremented";
  ALTER TABLE "payload"."orders" DROP COLUMN "confirmation_sent";
  `)
}
