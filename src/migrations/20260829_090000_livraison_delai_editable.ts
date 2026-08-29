import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Délai de livraison éditable (batch 3, demande client 2026-08-29) : nouveau
 * champ texte `livraisonDelai` sur le global `pages-legales` (onglet
 * « CGV & dons »), même patron « vide = défaut dur » que le reste du global —
 * vide = `DELIVERY_DELAY_RANGE` (« entre 48 h et 10 jours »,
 * `src/lib/delivery-copy.ts`). Consommé par la fiche produit, le panier et la
 * page de remerciement en plus des CGV ; le mail de confirmation de commande
 * (`order-mail.ts`, module pur sans I/O) garde la constante, jamais ce champ.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."pages_legales" ADD COLUMN "livraison_delai" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."pages_legales" DROP COLUMN IF EXISTS "livraison_delai";
  `)
}
