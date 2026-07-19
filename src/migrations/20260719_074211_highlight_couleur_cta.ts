import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Mises en avant : couleur (4 pop du site) + libellé du CTA éditables, et
 * l'ex-bandeau souscription codé en dur de la home devient une VRAIE mise en
 * avant (semée ci-dessous à l'identique — jaune, « Souscrire » →
 * `/souscription` — pour zéro régression visuelle au déploiement, le bloc en
 * dur étant retiré de `page.tsx` dans le même commit). Les défauts DB
 * ('pop-pink' / 'En savoir plus') backfillent les lignes existantes = rendu
 * inchangé pour toute campagne déjà saisie. Le swap des index
 * `edition_slug_*` est un pur réalignement de NOMS (le réordonnancement des
 * collections d'Admin v3 a inversé l'attribution auto books/collections) :
 * DDL final identique.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_highlight_couleur" AS ENUM('pop-pink', 'pop-teal', 'pop-orange', 'pop-yellow');
  DROP INDEX "payload"."edition_slug_idx";
  DROP INDEX "payload"."edition_slug_1_idx";
  ALTER TABLE "payload"."highlight" ADD COLUMN "couleur" "payload"."enum_highlight_couleur" DEFAULT 'pop-pink';
  ALTER TABLE "payload"."highlight" ADD COLUMN "lien_libelle" varchar DEFAULT 'En savoir plus';
  CREATE UNIQUE INDEX "edition_slug_1_idx" ON "payload"."collections" USING btree ("edition","slug");
  CREATE UNIQUE INDEX "edition_slug_idx" ON "payload"."books" USING btree ("edition","slug");
  INSERT INTO "payload"."highlight" ("titre", "texte", "couleur", "lien", "lien_libelle", "date_debut", "date_fin", "actif")
  VALUES (
    'La souscription est ouverte',
    'Soutenez les Éditions sociales et La Dispute — chaque souscription finance les prochains titres.',
    'pop-yellow',
    '/souscription',
    'Souscrire',
    now(),
    '2026-12-31T23:59:59.999Z',
    true
  );`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Retire d'abord la campagne semée par le up (identifiée par le tuple
  // exact du seed) — un rollback du code restaure le bandeau codé en dur,
  // la garder doublerait le bandeau souscription sur la home.
  await db.execute(sql`
   DELETE FROM "payload"."highlight"
   WHERE "titre" = 'La souscription est ouverte' AND "lien" = '/souscription' AND "lien_libelle" = 'Souscrire';
  DROP INDEX "payload"."edition_slug_idx";
  DROP INDEX "payload"."edition_slug_1_idx";
  CREATE UNIQUE INDEX "edition_slug_1_idx" ON "payload"."books" USING btree ("edition","slug");
  CREATE UNIQUE INDEX "edition_slug_idx" ON "payload"."collections" USING btree ("edition","slug");
  ALTER TABLE "payload"."highlight" DROP COLUMN "couleur";
  ALTER TABLE "payload"."highlight" DROP COLUMN "lien_libelle";
  DROP TYPE "payload"."enum_highlight_couleur";`)
}
