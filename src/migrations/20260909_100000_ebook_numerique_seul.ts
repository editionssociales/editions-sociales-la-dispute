import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Titre vendu UNIQUEMENT en numérique (client 2026-09-09 : « Notes sur Mill »
 * n'existe qu'en ePub, le moteur ne connaissait encore aucune notion
 * d'article numérique — port/adresse/stock s'appliquaient à tort). Case à
 * cocher `numerique_seul` sur `ebooks` (jamais sur `books`, même raison que
 * `20260824_110000_ebooks.ts` : `20260821_160000_produits_contreparties`
 * seede `books` par la Local API avec le schéma COURANT du code, toute
 * colonne ajoutée là casserait son rejeu sur une base neuve).
 *
 * `DEFAULT false NOT NULL` : décoché par défaut (fichier qui accompagne un
 * livre papier expédié, comportement historique de la collection depuis
 * `20260824_110000_ebooks.ts`) — vérifié par rejeu complet sur Postgres 17
 * vierge, y compris `20260821_160000_produits_contreparties`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."ebooks" ADD COLUMN "numerique_seul" boolean DEFAULT false NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."ebooks" DROP COLUMN IF EXISTS "numerique_seul";
  `)
}
