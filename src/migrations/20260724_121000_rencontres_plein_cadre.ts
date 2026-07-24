import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Agenda (retour client 2026-07-23) : case « Grande affiche (pleine
 * largeur) » sur les rencontres — cochée, l'événement garde la grande carte
 * héros pleine largeur ; décochée, il rejoint la grille 2-3 colonnes au
 * format des rencontres passées. Les événements existants restent en carte
 * standard (défaut false) SAUF la braderie déjà en prod, passée en grande
 * affiche pour conserver son rendu actuel (rapprochement tolérant par titre,
 * no-op si aucune fiche ne matche).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."rencontres" ADD COLUMN "plein_cadre" boolean DEFAULT false;

  UPDATE "payload"."rencontres" SET "plein_cadre" = true WHERE "titre" ILIKE '%braderie%';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."rencontres" DROP COLUMN IF EXISTS "plein_cadre";
  `)
}
