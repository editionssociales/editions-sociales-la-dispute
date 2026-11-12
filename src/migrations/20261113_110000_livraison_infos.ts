import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Section « Livraison » des CGV réécrivable (client 2026-11) : champ texte
 * `livraisonInfos` sur le global `pages-legales` (onglet « CGV & dons »). Vide
 * = le paragraphe actuel (`site-defaults.ts:livraisonInfosDefaut`, avec le
 * délai `livraisonDelai` inséré) ; saisi = ce texte remplace le paragraphe.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."pages_legales" ADD COLUMN IF NOT EXISTS "livraison_infos" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."pages_legales" DROP COLUMN IF EXISTS "livraison_infos";
  `)
}
