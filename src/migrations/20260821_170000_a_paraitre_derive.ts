import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * « À paraître » devient une pure conséquence de `date_parution` comparée à
 * la date courante (décision client 2026-08-21) : l'ex-checkbox informative
 * `aParaitre` est supprimée du schéma. Elle n'était JAMAIS lue par la
 * vendabilité (`sellability.ts` compare la date de parution), seulement par
 * les vues admin (dashboard, chips de filtre), désormais dérivées via
 * `upcomingBoundaryUtc` (`sellability.ts`). Aucun backfill : la case cochée
 * n'était qu'une étiquette manuelle, l'information vit déjà dans
 * `date_parution`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."books" DROP COLUMN IF EXISTS "a_paraitre";
  ALTER TABLE "payload"."_books_v" DROP COLUMN IF EXISTS "version_a_paraitre";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."books" ADD COLUMN "a_paraitre" boolean DEFAULT false;
  ALTER TABLE "payload"."_books_v" ADD COLUMN "version_a_paraitre" boolean DEFAULT false;
  `)
}
