import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Pied de page — suppression de la phrase « Vente directe et distribution
 * indépendante — sans mécène ni actionnaire. » (retour Clara 2026-08-07) et,
 * avec elle, du champ qui la portait (`footer.texteDiffusion` du global
 * `pages-legales`).
 *
 * Le champ ne pouvait PAS servir à l'enlever depuis /admin : `mergeReglagesSite`
 * (`src/lib/site-content-core.ts`) retombe sur le défaut dur pour tout champ
 * vidé — un texte vide y réaffichait la phrase. La cellule
 * « Diffusion-Distribution » ne garde donc que son titre et sa sortie vers le
 * catalogue, sans texte éditable.
 *
 * Colonne vide en prod au moment de la bascule (relevé 2026-08-17 : `NULL`) —
 * aucune saisie client perdue. `down` la recrée nullable, à l'identique.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."pages_legales" DROP COLUMN IF EXISTS "footer_texte_diffusion";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."pages_legales" ADD COLUMN "footer_texte_diffusion" varchar;
  `)
}
